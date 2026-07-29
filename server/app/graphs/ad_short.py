"""LangGraph short-form ad pipeline with human-in-the-loop.

Steps: brief → copy review → master review → transition → process → selection → produce
Default aspect: 9:16 vertical social ads.
"""

from __future__ import annotations

import json
import operator
import re
import uuid
from typing import Annotated, Any, Literal, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from app.services import gateway
from app.services import video as video_service
from app.services.llm import get_text_llm


def _merge_usage(base: dict[str, int] | None, extra: dict[str, int] | None) -> dict[str, int]:
    a = base or {}
    b = extra or {}
    keys = ("promptTokens", "completionTokens", "cachedTokens", "totalTokens")
    return {k: int(a.get(k) or 0) + int(b.get(k) or 0) for k in keys}


def _usage_reducer(left: dict[str, int] | None, right: dict[str, int] | None) -> dict[str, int]:
    return _merge_usage(left, right)

AD_MASTER_SYSTEM_PROMPT = (
    "You are a senior short-form advertising storyboard artist for TikTok / Reels / Shorts. "
    "Create a clean vertical 9:16 keyframe grid (prefer 2 columns x 3 rows = 6 panels) for a SOCIAL VIDEO AD. "
    "CRITICAL RULES: "
    "1. NO TEXT, NO CAPTIONS, NO LOGOS AS READABLE WORDS, NO NUMBERING on the image itself. "
    "2. NO BORDERS OR PAPER STORYBOARD FRAMES. Panels fill the frame with minimal separation. "
    "3. Structure the 6 panels as: Hook → Problem/Desire → Product reveal → Benefit/demo → Social proof or delight → CTA moment (character pointing/holding product toward camera). "
    "4. High-fidelity commercial lighting, consistent talent/product across panels. "
    "5. Safe for vertical crop: keep hero product and faces in the center third. "
    "6. Cinematic but punchy — made for 6–15 second ads, not feature films."
)

TRANSITION_SYSTEM_PROMPT = (
    "You are creating transition keyframes for a short-form vertical ad. "
    "Generate ONLY clean first/last frames needed for motion between selected beats. "
    "CRITICAL: NO TEXT, NO NUMBERING, NO BORDERS. Match the master ad style and lighting."
)


class AdBrief(TypedDict, total=False):
    product: str
    sellingPoints: str
    audience: str
    cta: str
    durationSec: int
    aspectRatio: str
    platform: str
    template: str
    tone: str


class AdOptions(TypedDict, total=False):
    aspect_ratio: str
    max_panels: int
    use_fast_video: bool
    enhance_video_prompts: bool
    generate_videos: bool


class PanelState(TypedDict, total=False):
    index: int
    imageUrl: str
    linkedImageUrl: str
    prompt: str
    videoUrl: str
    duration: int
    subtitle: str
    error: str


class AdState(TypedDict, total=False):
    brief: AdBrief
    working_prompt: str
    copy_hook: str
    copy_lines: list[str]
    copy_cta: str
    copy_visual_brief: str
    master_url: str
    panel_count: int
    analysis: str
    transition_request: str
    transition_url: str
    transition_panels: list[str]
    processed_panels: list[str]
    panels: list[PanelState]
    options: AdOptions
    step: str
    phase: str
    waiting_for: str
    errors: Annotated[list[str], operator.add]
    usage: Annotated[dict[str, int], _usage_reducer]


def _opts(state: AdState) -> AdOptions:
    return state.get("options") or {}


def _brief(state: AdState) -> AdBrief:
    return state.get("brief") or {}


def _extraction_prompt(index: int, columns: int = 2, kind: Literal["main", "transition"] = "main") -> str:
    row = index // columns + 1
    col = index % columns + 1
    if kind == "transition":
        return f"""
Look at the provided transition storyboard grid.
Extract strictly the single panel at position #{index + 1} (reading order: Row {row}, Column {col}).
Generate a high-resolution, full-frame vertical 9:16 cinematic version of THIS SPECIFIC PANEL ONLY.
- Remove any text, captions, numbers, or borders.
- Keep product and face in the vertical safe center.
""".strip()
    return f"""
Look at the provided vertical ad storyboard grid.
Extract strictly the single panel at position #{index + 1} (reading order: Row {row}, Column {col}).
Generate a high-resolution, full-frame vertical 9:16 cinematic version of THIS SPECIFIC PANEL ONLY.
- Remove any text, captions, numbers, or borders.
- Keep hero product and talent in the center third for social safe zones.
""".strip()


def _parse_copy_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw[start : end + 1])
                return data if isinstance(data, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}


def _build_visual_prompt(state: AdState) -> str:
    b = _brief(state)
    lines = state.get("copy_lines") or []
    lines_txt = " | ".join(lines[:5])
    return (
        f"Product: {b.get('product') or ''}. "
        f"Audience: {b.get('audience') or ''}. "
        f"Selling points: {b.get('sellingPoints') or ''}. "
        f"CTA: {state.get('copy_cta') or b.get('cta') or ''}. "
        f"Hook: {state.get('copy_hook') or ''}. "
        f"VO beats: {lines_txt}. "
        f"Visual brief: {state.get('copy_visual_brief') or ''}. "
        f"Platform: {b.get('platform') or 'tiktok'}. "
        f"Tone: {b.get('tone') or 'energetic commercial'}. "
        f"Duration target: {b.get('durationSec') or 15}s."
    ).strip()


async def node_prepare(state: AdState) -> dict[str, Any]:
    b = _brief(state)
    if not (b.get("product") or "").strip():
        return {"errors": ["Product is required"], "phase": "failed", "step": "brief"}
    return {
        "panels": [],
        "processed_panels": [],
        "transition_panels": [],
        "errors": [],
        "phase": "prepared",
        "step": "brief",
        "waiting_for": "",
        "panel_count": int(state.get("panel_count") or 0),
        "master_url": "",
        "transition_url": "",
        "transition_request": "",
        "analysis": "",
        "copy_hook": "",
        "copy_lines": [],
        "copy_cta": b.get("cta") or "",
        "copy_visual_brief": "",
        "working_prompt": "",
        "options": {
            "aspect_ratio": b.get("aspectRatio") or "9:16",
            "max_panels": int(_opts(state).get("max_panels") or 6),
            "use_fast_video": True,
            **_opts(state),
        },
    }


async def node_generate_copy(state: AdState) -> dict[str, Any]:
    b = _brief(state)
    template = (b.get("template") or "pain-product-cta").strip()
    system = (
        "You write short-form social video ad scripts (TikTok/Reels/Shorts). "
        "Return ONLY valid JSON with keys: hook (string), lines (array of 3-5 short VO/subtitle lines), "
        "cta (string), visualBrief (string describing shot-by-shot visuals without on-screen text). "
        "Keep language punchy. Match the requested template structure."
    )
    user = (
        f"Template: {template}\n"
        f"Product: {b.get('product')}\n"
        f"Selling points: {b.get('sellingPoints') or ''}\n"
        f"Audience: {b.get('audience') or ''}\n"
        f"Desired CTA: {b.get('cta') or ''}\n"
        f"Duration: {b.get('durationSec') or 15} seconds\n"
        f"Platform: {b.get('platform') or 'tiktok'}\n"
        f"Tone: {b.get('tone') or 'energetic'}\n"
        "Write in the same language as the product/selling points text."
    )
    try:
        llm = get_text_llm()
        msg = await llm.ainvoke(
            [{"role": "system", "content": system}, {"role": "user", "content": user}]
        )
        text = getattr(msg, "content", None) or str(msg)
        if isinstance(text, list):
            text = " ".join(
                part.get("text", "") if isinstance(part, dict) else str(part) for part in text
            )
        data = _parse_copy_json(str(text))
        hook = str(data.get("hook") or "").strip()
        lines_raw = data.get("lines") or []
        lines = [str(x).strip() for x in lines_raw if str(x).strip()][:5]
        cta = str(data.get("cta") or b.get("cta") or "").strip()
        visual = str(data.get("visualBrief") or data.get("visual_brief") or "").strip()
        if not hook and not lines:
            return {"errors": ["Copy generation returned empty"], "phase": "failed", "step": "copy"}
        return {
            "copy_hook": hook,
            "copy_lines": lines,
            "copy_cta": cta,
            "copy_visual_brief": visual,
            "phase": "copy_ready",
            "step": "copy",
        }
    except Exception as exc:
        return {"errors": [f"generate_copy failed: {exc}"], "phase": "failed", "step": "copy"}


async def node_await_copy_review(state: AdState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "review_copy",
            "step": "copy",
            "message": "Review the ad copy, then continue to storyboard.",
            "hook": state.get("copy_hook"),
            "lines": state.get("copy_lines") or [],
            "cta": state.get("copy_cta"),
            "visualBrief": state.get("copy_visual_brief"),
            "brief": state.get("brief") or {},
        }
    )
    if isinstance(decision, dict) and decision.get("action") == "revise_copy":
        return {
            "phase": "revise_copy",
            "step": "copy",
            "copy_hook": str(decision.get("hook") or state.get("copy_hook") or ""),
            "copy_lines": decision.get("lines") or state.get("copy_lines") or [],
            "copy_cta": str(decision.get("cta") or state.get("copy_cta") or ""),
            "copy_visual_brief": str(
                decision.get("visualBrief") or state.get("copy_visual_brief") or ""
            ),
            # If user edited in place and wants regenerate from brief notes:
            "brief": {
                **_brief(state),
                **(
                    {"sellingPoints": decision["notes"]}
                    if decision.get("notes")
                    else {}
                ),
            },
        }

    # approve_copy — allow inline edits without full regenerate
    updates: dict[str, Any] = {"phase": "copy_approved", "step": "master", "waiting_for": ""}
    if isinstance(decision, dict):
        if decision.get("hook") is not None:
            updates["copy_hook"] = str(decision.get("hook") or "")
        if decision.get("lines") is not None:
            updates["copy_lines"] = [str(x) for x in (decision.get("lines") or []) if str(x).strip()]
        if decision.get("cta") is not None:
            updates["copy_cta"] = str(decision.get("cta") or "")
        if decision.get("visualBrief") is not None:
            updates["copy_visual_brief"] = str(decision.get("visualBrief") or "")
    return updates


async def node_generate_master(state: AdState) -> dict[str, Any]:
    working = _build_visual_prompt(state)
    aspect = _opts(state).get("aspect_ratio") or "9:16"
    full_prompt = f"{AD_MASTER_SYSTEM_PROMPT}\n\nAd Brief:\n{working}"
    try:
        url, description, usage = await gateway.generate_image_text_to_image(full_prompt, aspect)
        panel_count, analysis, usage2 = await gateway.analyze_storyboard(url)
        max_panels = int(_opts(state).get("max_panels") or 6)
        return {
            "working_prompt": working,
            "master_url": url,
            "analysis": analysis or description or "",
            "panel_count": max(1, min(max_panels, panel_count or 6)),
            "phase": "master_ready",
            "step": "master",
            "usage": _merge_usage(usage, usage2),
        }
    except Exception as exc:
        return {"errors": [f"generate_master failed: {exc}"], "phase": "failed", "step": "master"}


async def node_await_master_review(state: AdState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "review_master",
            "step": "master",
            "message": "Review the vertical ad storyboard, then continue.",
            "masterUrl": state.get("master_url"),
            "panelCount": state.get("panel_count"),
            "workingPrompt": state.get("working_prompt"),
            "analysis": state.get("analysis"),
            "hook": state.get("copy_hook"),
            "lines": state.get("copy_lines") or [],
            "cta": state.get("copy_cta"),
        }
    )
    if isinstance(decision, dict) and decision.get("action") == "revise_master":
        return {"phase": "revise_master", "step": "master", "master_url": ""}
    updates: dict[str, Any] = {"phase": "master_approved", "step": "transition", "waiting_for": ""}
    if isinstance(decision, dict) and decision.get("panelCount") is not None:
        try:
            count = int(decision["panelCount"])
            max_panels = int(_opts(state).get("max_panels") or 12)
            updates["panel_count"] = max(1, min(max_panels, count))
        except (TypeError, ValueError):
            pass
    return updates


async def node_await_transition_input(state: AdState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "transition_input",
            "step": "transition",
            "message": "Describe transition frames, or skip.",
            "masterUrl": state.get("master_url"),
            "workingPrompt": state.get("working_prompt"),
        }
    )
    if not isinstance(decision, dict):
        return {"phase": "transition_skipped", "step": "process", "transition_panels": [], "transition_request": ""}
    action = decision.get("action") or "skip_transition"
    if action == "skip_transition":
        return {"phase": "transition_skipped", "step": "process", "transition_panels": [], "transition_request": ""}
    transition_prompt = str(decision.get("transitionPrompt") or "").strip()
    if not transition_prompt:
        return {"phase": "transition_skipped", "step": "process", "transition_panels": [], "transition_request": ""}
    return {"phase": "transition_requested", "step": "transition", "transition_request": transition_prompt}


async def node_generate_transition(state: AdState) -> dict[str, Any]:
    request = (state.get("transition_request") or "").strip()
    master = state.get("master_url") or ""
    if not request or not master:
        return {"phase": "transition_skipped", "step": "process", "transition_panels": []}
    full_prompt = (
        f"{TRANSITION_SYSTEM_PROMPT}\n\nAD CONTEXT: {state.get('working_prompt') or ''}\n\n"
        f"TRANSITION REQUEST: {request}"
    )
    try:
        url, _, usage = await gateway.generate_image_editing(full_prompt, "9:16", master, None)
        count, _, usage2 = await gateway.analyze_storyboard(url)
        count = max(1, min(6, count))
        panels: list[str] = []
        errors: list[str] = []
        usage_acc = _merge_usage(usage, usage2)
        for index in range(count):
            try:
                panel_url, _, panel_usage = await gateway.generate_image_editing(
                    _extraction_prompt(index, columns=2, kind="transition"),
                    "9:16",
                    url,
                    None,
                )
                panels.append(panel_url)
                usage_acc = _merge_usage(usage_acc, panel_usage)
            except Exception as exc:
                errors.append(f"transition panel[{index}] failed: {exc}")
        return {
            "transition_url": url,
            "transition_panels": panels,
            "phase": "transition_ready",
            "step": "process",
            "errors": errors,
            "usage": usage_acc,
        }
    except Exception as exc:
        return {
            "phase": "transition_skipped",
            "step": "process",
            "transition_panels": [],
            "errors": [f"transition generate failed: {exc}"],
        }


async def node_process_panels(state: AdState) -> dict[str, Any]:
    master = state.get("master_url") or ""
    count = int(state.get("panel_count") or 0)
    if not master or count <= 0:
        return {"errors": ["Cannot process panels without master/count"], "phase": "failed", "step": "process"}
    panels: list[str] = []
    errors: list[str] = []
    usage_acc: dict[str, int] = {}
    for index in range(count):
        try:
            url, _, usage = await gateway.generate_image_editing(
                _extraction_prompt(index, columns=2, kind="main"),
                "9:16",
                master,
                None,
            )
            panels.append(url)
            usage_acc = _merge_usage(usage_acc, usage)
        except Exception as exc:
            errors.append(f"panel[{index}] process failed: {exc}")
    return {
        "processed_panels": panels,
        "phase": "process_ready" if panels else "failed",
        "step": "selection",
        "errors": errors,
        "usage": usage_acc,
    }


async def node_await_selection(state: AdState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "select_panels",
            "step": "selection",
            "message": "Build the final ad sequence.",
            "masterUrl": state.get("master_url"),
            "processedPanels": state.get("processed_panels") or [],
            "transitionPanels": state.get("transition_panels") or [],
            "lines": state.get("copy_lines") or [],
            "cta": state.get("copy_cta"),
        }
    )
    if not isinstance(decision, dict) or decision.get("action") != "submit_selection":
        return {"errors": ["Selection required"], "phase": "failed", "step": "selection"}

    raw_panels = decision.get("panels") or []
    lines = state.get("copy_lines") or []
    selected: list[PanelState] = []
    for i, item in enumerate(raw_panels):
        subtitle = lines[i] if i < len(lines) else (state.get("copy_cta") if i == len(raw_panels) - 1 else "")
        if isinstance(item, str):
            selected.append(
                {"index": i, "imageUrl": item, "prompt": "", "duration": 3, "subtitle": subtitle or ""}
            )
        elif isinstance(item, dict):
            selected.append(
                {
                    "index": i,
                    "imageUrl": str(item.get("imageUrl") or item.get("image_url") or ""),
                    "linkedImageUrl": str(item.get("linkedImageUrl") or item.get("linked_image_url") or ""),
                    "prompt": str(item.get("prompt") or ""),
                    "duration": int(item.get("duration") or 3),
                    "videoUrl": str(item.get("videoUrl") or item.get("video_url") or ""),
                    "subtitle": str(item.get("subtitle") or subtitle or ""),
                }
            )
    selected = [p for p in selected if p.get("imageUrl")]
    if not selected:
        return {"errors": ["Select at least one panel"], "phase": "failed", "step": "selection"}
    return {"panels": selected, "phase": "selection_ready", "step": "result"}


async def node_await_produce(state: AdState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "confirm_produce",
            "step": "result",
            "message": "Batch-generate ad clips, or skip for manual per-panel control.",
            "panels": state.get("panels") or [],
            "workingPrompt": state.get("working_prompt"),
            "lines": state.get("copy_lines") or [],
            "cta": state.get("copy_cta"),
        }
    )
    if not isinstance(decision, dict):
        return {"phase": "produce_skipped", "step": "result"}
    action = decision.get("action") or "skip_produce"
    if action == "skip_produce":
        return {"phase": "complete", "step": "result"}
    return {
        "phase": "produce_requested",
        "step": "result",
        "options": {
            **_opts(state),
            "enhance_video_prompts": bool(decision.get("enhanceVideoPrompts", True)),
            "generate_videos": bool(decision.get("generateVideos", True)),
            "use_fast_video": bool(decision.get("useFastVideo", True)),
        },
    }


async def node_produce(state: AdState) -> dict[str, Any]:
    opts = _opts(state)
    panels = list(state.get("panels") or [])
    errors: list[str] = []
    updated: list[PanelState] = []
    master_desc = state.get("working_prompt") or ""
    usage_acc: dict[str, int] = {}

    for panel in panels:
        image_url = panel.get("imageUrl") or ""
        prompt = (panel.get("prompt") or "").strip()
        current: PanelState = {**panel}

        if opts.get("enhance_video_prompts", True) and image_url:
            try:
                prompt, usage = await gateway.enhance_prompt(
                    image_url,
                    master_description=master_desc,
                    panel_prompt=prompt or (panel.get("subtitle") or ""),
                )
                current["prompt"] = prompt
                usage_acc = _merge_usage(usage_acc, usage)
            except Exception as exc:
                errors.append(f"panel[{panel.get('index')}] prompt failed: {exc}")

        prompt = (current.get("prompt") or "").strip() or master_desc or "Dynamic product motion"
        current["prompt"] = prompt

        if opts.get("generate_videos", True) and image_url:
            try:
                result = await video_service.generate_image_to_video(
                    prompt=prompt,
                    image_url=image_url,
                    linked_image_url=current.get("linkedImageUrl") or None,
                    use_fast_model=bool(opts.get("use_fast_video", True)),
                )
                video_url = video_service.extract_video_url(result)
                if not video_url:
                    raise RuntimeError("Video URL missing from fal response")
                current["videoUrl"] = video_url
            except Exception as exc:
                errors.append(f"panel[{panel.get('index')}] video failed: {exc}")
                current["error"] = str(exc)
        updated.append(current)

    return {
        "panels": updated,
        "phase": "complete",
        "step": "result",
        "errors": errors,
        "usage": usage_acc,
    }


def _after_copy(state: AdState) -> Literal["generate_copy", "generate_master", "__end__"]:
    if state.get("phase") == "failed":
        return "__end__"
    if state.get("phase") == "revise_copy":
        # User saved edits in place — if they asked revise_copy with notes, regenerate;
        # if they only wanted regenerate, phase revise_copy always regenerates.
        return "generate_copy"
    return "generate_master"


def _after_master(state: AdState) -> Literal["generate_master", "await_transition_input", "__end__"]:
    if state.get("phase") == "failed":
        return "__end__"
    if state.get("phase") == "revise_master":
        return "generate_master"
    return "await_transition_input"


def _after_transition(state: AdState) -> Literal["generate_transition", "process_panels"]:
    if state.get("phase") == "transition_requested":
        return "generate_transition"
    return "process_panels"


def _after_produce(state: AdState) -> Literal["produce", "__end__"]:
    if state.get("phase") == "produce_requested":
        return "produce"
    return "__end__"


def build_ad_short_graph():
    graph = StateGraph(AdState)
    graph.add_node("prepare", node_prepare)
    graph.add_node("generate_copy", node_generate_copy)
    graph.add_node("await_copy_review", node_await_copy_review)
    graph.add_node("generate_master", node_generate_master)
    graph.add_node("await_master_review", node_await_master_review)
    graph.add_node("await_transition_input", node_await_transition_input)
    graph.add_node("generate_transition", node_generate_transition)
    graph.add_node("process_panels", node_process_panels)
    graph.add_node("await_selection", node_await_selection)
    graph.add_node("await_produce", node_await_produce)
    graph.add_node("produce", node_produce)

    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "generate_copy")
    graph.add_edge("generate_copy", "await_copy_review")
    graph.add_conditional_edges(
        "await_copy_review",
        _after_copy,
        {"generate_copy": "generate_copy", "generate_master": "generate_master", "__end__": END},
    )
    graph.add_edge("generate_master", "await_master_review")
    graph.add_conditional_edges(
        "await_master_review",
        _after_master,
        {
            "generate_master": "generate_master",
            "await_transition_input": "await_transition_input",
            "__end__": END,
        },
    )
    graph.add_conditional_edges(
        "await_transition_input",
        _after_transition,
        {"generate_transition": "generate_transition", "process_panels": "process_panels"},
    )
    graph.add_edge("generate_transition", "process_panels")
    graph.add_edge("process_panels", "await_selection")
    graph.add_edge("await_selection", "await_produce")
    graph.add_conditional_edges(
        "await_produce",
        _after_produce,
        {"produce": "produce", "__end__": END},
    )
    graph.add_edge("produce", END)

    return graph.compile(checkpointer=MemorySaver())


_GRAPH = None


def get_ad_short_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_ad_short_graph()
    return _GRAPH


def _serialize_state(values: dict[str, Any] | None) -> dict[str, Any]:
    values = values or {}
    return {
        "brief": values.get("brief") or {},
        "workingPrompt": values.get("working_prompt"),
        "copy": {
            "hook": values.get("copy_hook") or "",
            "lines": values.get("copy_lines") or [],
            "cta": values.get("copy_cta") or "",
            "visualBrief": values.get("copy_visual_brief") or "",
        },
        "masterUrl": values.get("master_url") or None,
        "panelCount": values.get("panel_count") or 0,
        "analysis": values.get("analysis") or "",
        "transitionUrl": values.get("transition_url") or None,
        "transitionPanels": values.get("transition_panels") or [],
        "processedPanels": values.get("processed_panels") or [],
        "panels": values.get("panels") or [],
        "step": values.get("step") or "brief",
        "phase": values.get("phase") or "",
        "waitingFor": values.get("waiting_for") or "",
        "errors": values.get("errors") or [],
        "usage": values.get("usage")
        or {"promptTokens": 0, "completionTokens": 0, "cachedTokens": 0, "totalTokens": 0},
    }


def _extract_interrupt(result: dict[str, Any] | Any) -> dict[str, Any] | None:
    if isinstance(result, dict) and "__interrupt__" in result:
        items = result.get("__interrupt__") or []
        if items:
            first = items[0]
            value = getattr(first, "value", None)
            if value is None and isinstance(first, tuple) and first:
                value = getattr(first[0], "value", first[0])
            if isinstance(value, dict):
                return value
            return {"raw": value}
    return None


async def _run_until_pause(thread_id: str, payload: Any) -> dict[str, Any]:
    graph = get_ad_short_graph()
    config = {"configurable": {"thread_id": thread_id}}

    interrupt_payload: dict[str, Any] | None = None
    async for event in graph.astream(payload, config, stream_mode="updates"):
        if not isinstance(event, dict):
            continue
        for node_out in event.values():
            if isinstance(node_out, dict) and "__interrupt__" in node_out:
                interrupt_payload = _extract_interrupt(node_out)
        if "__interrupt__" in event:
            interrupt_payload = _extract_interrupt(event)

    snap = await graph.aget_state(config)
    values = snap.values if snap else {}
    inter = None
    if snap and snap.tasks:
        for task in snap.tasks:
            interrupts = getattr(task, "interrupts", None) or ()
            if interrupts:
                val = getattr(interrupts[0], "value", None)
                if isinstance(val, dict):
                    inter = val
                    break

    waiting = (inter or interrupt_payload or {}).get("type") if isinstance(inter or interrupt_payload, dict) else ""
    status = "interrupted" if (inter or interrupt_payload or (snap and snap.next)) else "completed"
    if values.get("phase") == "failed":
        status = "failed"

    return {
        "engine": "langgraph",
        "mode": "ad-short",
        "threadId": thread_id,
        "status": status,
        "waitingFor": waiting or values.get("waiting_for") or "",
        "interrupt": inter or interrupt_payload,
        "state": _serialize_state(dict(values) if values else {}),
    }


async def start_ad_session(brief: AdBrief, *, options: AdOptions | None = None) -> dict[str, Any]:
    opts: AdOptions = {
        "aspect_ratio": brief.get("aspectRatio") or "9:16",
        "max_panels": 6,
        "use_fast_video": True,
    }
    if options:
        opts.update(options)
    thread_id = str(uuid.uuid4())
    return await _run_until_pause(
        thread_id,
        {
            "brief": brief,
            "options": opts,
            "errors": [],
            "panels": [],
            "phase": "started",
            "step": "brief",
        },
    )


async def resume_ad_session(thread_id: str, decision: dict[str, Any]) -> dict[str, Any]:
    return await _run_until_pause(thread_id, Command(resume=decision))


async def get_ad_session(thread_id: str) -> dict[str, Any]:
    graph = get_ad_short_graph()
    config = {"configurable": {"thread_id": thread_id}}
    snap = await graph.aget_state(config)
    if not snap or not snap.values:
        return {
            "engine": "langgraph",
            "mode": "ad-short",
            "threadId": thread_id,
            "status": "not_found",
            "waitingFor": "",
            "interrupt": None,
            "state": _serialize_state({}),
        }

    inter = None
    if snap.tasks:
        for task in snap.tasks:
            interrupts = getattr(task, "interrupts", None) or ()
            if interrupts:
                val = getattr(interrupts[0], "value", None)
                if isinstance(val, dict):
                    inter = val
                    break

    values = dict(snap.values)
    status = "interrupted" if (inter or snap.next) else "completed"
    if values.get("phase") == "failed":
        status = "failed"

    return {
        "engine": "langgraph",
        "mode": "ad-short",
        "threadId": thread_id,
        "status": status,
        "waitingFor": (inter or {}).get("type", "") if inter else "",
        "interrupt": inter,
        "state": _serialize_state(values),
    }
