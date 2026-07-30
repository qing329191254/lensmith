"""LangGraph storyboard pipeline with human-in-the-loop.

Wizard steps (match StoryboardView):
  生成(prompt) → 转场(transition) → 精修(process) → 筛选(selection) → 成片(result)

AI nodes run when requested; human gates pause via interrupt().
Skip/run transition both land on process gate — AI panel extract is opt-in.
"""

from __future__ import annotations

import operator
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

MASTER_SYSTEM_PROMPT = (
    "You are a professional storyboard artist creating a source image for a video generation pipeline. "
    "Create a strict 3x2 grid of 6 cinematic keyframes. "
    "CRITICAL RULES: "
    "1. NO TEXT, NO CAPTIONS, NO NUMBERING, NO TITLES. The image must be purely visual. "
    "2. NO BORDERS, NO FRAMES, NO PADDING. The panels should fill the space or have minimal separation. "
    "3. High-fidelity cinematic style, consistent character and lighting across all panels. "
    "4. Do not render the 'paper' or 'document' of a storyboard, just the raw panel images arranged in a grid. "
    "5. TRANSITION HANDLING: If the user describes a transition effect (zoom, pan, rotation, blur, time-shift), "
    "render the INTERMEDIATE STATE as a visual reference."
)

TRANSITION_SYSTEM_PROMPT = (
    "You are creating a secondary storyboard with ONLY transition frames. "
    "The user will provide context from their main storyboard and describe which transition frames they need. "
    "Generate a grid showing ONLY the requested panels: clean first and last frames for each transition. "
    "CRITICAL: NO TEXT, NO NUMBERING, NO BORDERS. "
    "These frames must be visually consistent with the provided main storyboard style and lighting."
)


class StoryboardOptions(TypedDict, total=False):
    enhance_text: bool
    aspect_ratio: str
    max_panels: int
    use_fast_video: bool


class PanelState(TypedDict, total=False):
    index: int
    imageUrl: str
    linkedImageUrl: str
    prompt: str
    videoUrl: str
    duration: int
    error: str


class StoryboardState(TypedDict, total=False):
    prompt: str
    working_prompt: str
    master_url: str
    panel_count: int
    analysis: str
    transition_request: str
    transition_url: str
    transition_panels: list[str]
    processed_panels: list[str]
    panels: list[PanelState]
    options: StoryboardOptions
    step: str
    phase: str
    waiting_for: str
    errors: Annotated[list[str], operator.add]
    usage: Annotated[dict[str, int], _usage_reducer]


def _opts(state: StoryboardState) -> StoryboardOptions:
    return state.get("options") or {}


def _extraction_prompt(index: int, columns: int = 3, kind: Literal["main", "transition"] = "main") -> str:
    row = index // columns + 1
    col = index % columns + 1
    if kind == "transition":
        return f"""
Look at the provided transition storyboard grid.
Extract strictly the single panel at position #{index + 1} (reading order: Row {row}, Column {col}).
Generate a high-resolution, full-frame cinematic version of THIS SPECIFIC PANEL ONLY.
This is a transition keyframe (first or last frame).
- Remove any text, captions, numbers, or borders.
- Ensure the aspect ratio is standard 16:9 cinematic.
- Maintain strict visual consistency with the master style.
""".strip()
    return f"""
Look at the provided storyboard grid.
Extract strictly the single panel at position #{index + 1} (reading order: Row {row}, Column {col}).
Generate a high-resolution, full-frame cinematic version of THIS SPECIFIC PANEL ONLY.
QC INSTRUCTIONS:
- Remove any text, captions, numbers, or borders.
- Fix any non-standard elements or distortions.
- Ensure the aspect ratio is standard 16:9 cinematic.
- Maintain strict visual consistency with the master style.
""".strip()


async def node_prepare(state: StoryboardState) -> dict[str, Any]:
    prompt = (state.get("prompt") or "").strip()
    if not prompt and not state.get("master_url"):
        return {"errors": ["Prompt is required"], "phase": "failed", "step": "prompt"}
    return {
        "working_prompt": prompt or state.get("working_prompt") or "",
        "panels": [],
        "processed_panels": [],
        "transition_panels": [],
        "errors": [],
        "phase": "prepared",
        "step": "prompt",
        "waiting_for": "",
        "panel_count": int(state.get("panel_count") or 0),
        "master_url": state.get("master_url") or "",
        "transition_url": "",
        "transition_request": "",
        "analysis": "",
    }


async def node_enhance_text(state: StoryboardState) -> dict[str, Any]:
    if not _opts(state).get("enhance_text") or not state.get("working_prompt"):
        return {"phase": "text_ready"}
    try:
        llm = get_text_llm()
        system = (
            "You are an expert prompt engineer for cinematic storyboards. "
            "Enhance the user prompt with visual detail, lighting, and camera language. "
            "Keep under 200 words. Return ONLY the enhanced prompt."
        )
        msg = await llm.ainvoke(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Enhance this storyboard prompt:\n\n{state['working_prompt']}"},
            ]
        )
        text = getattr(msg, "content", None) or str(msg)
        if isinstance(text, list):
            text = " ".join(
                part.get("text", "") if isinstance(part, dict) else str(part) for part in text
            )
        enhanced = str(text).strip() or state["working_prompt"]
        return {"working_prompt": enhanced, "phase": "text_enhanced"}
    except Exception as exc:
        return {"phase": "text_ready", "errors": [f"enhance_text skipped: {exc}"]}


async def node_generate_master(state: StoryboardState) -> dict[str, Any]:
    max_panels = int(_opts(state).get("max_panels") or 12)
    default_panels = max(1, min(max_panels, int(_opts(state).get("max_panels") or 6)))

    if state.get("master_url"):
        try:
            panel_count, description, usage = await gateway.analyze_storyboard_or_default(
                state["master_url"],
                default_panel_count=default_panels,
                max_panels=max_panels,
            )
            return {
                "panel_count": panel_count,
                "analysis": description or "",
                "phase": "master_ready",
                "step": "prompt",
                "usage": usage,
            }
        except Exception as exc:
            return {"errors": [f"analyze uploaded master failed: {exc}"], "phase": "failed"}

    aspect = _opts(state).get("aspect_ratio") or "3:2"
    full_prompt = f"{MASTER_SYSTEM_PROMPT}\n\nUser Request: {state['working_prompt']}"
    try:
        url, description, usage = await gateway.generate_image_text_to_image(full_prompt, aspect)
        panel_count, analysis, usage2 = await gateway.analyze_storyboard_or_default(
            url,
            default_panel_count=default_panels,
            max_panels=max_panels,
        )
        return {
            "master_url": url,
            "analysis": analysis or description or "",
            "panel_count": panel_count,
            "phase": "master_ready",
            "step": "prompt",
            "usage": _merge_usage(usage, usage2),
        }
    except Exception as exc:
        return {"errors": [str(exc)], "phase": "failed", "step": "prompt"}


async def node_await_master_review(state: StoryboardState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "review_master",
            "step": "prompt",
            "message": "Review the master storyboard, then continue to transitions.",
            "masterUrl": state.get("master_url"),
            "panelCount": state.get("panel_count"),
            "workingPrompt": state.get("working_prompt"),
            "analysis": state.get("analysis"),
        }
    )
    if isinstance(decision, dict) and decision.get("action") == "revise":
        new_prompt = str(decision.get("prompt") or "").strip()
        if new_prompt:
            return {
                "prompt": new_prompt,
                "working_prompt": new_prompt,
                "master_url": "",
                "phase": "revise_master",
                "step": "prompt",
            }
    updates: dict[str, Any] = {"phase": "master_approved", "step": "transition", "waiting_for": ""}
    if isinstance(decision, dict) and decision.get("panelCount") is not None:
        try:
            count = int(decision["panelCount"])
            max_panels = int(_opts(state).get("max_panels") or 12)
            updates["panel_count"] = max(1, min(max_panels, count))
        except (TypeError, ValueError):
            pass
    return updates


async def node_await_transition_input(state: StoryboardState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "transition_input",
            "step": "transition",
            "message": "Describe transition frames to generate, or skip this step.",
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
        return {
            "phase": "transition_skipped",
            "step": "process",
            "transition_panels": [],
            "transition_request": "",
            "errors": ["Empty transition prompt — skipped"],
        }

    return {
        "phase": "transition_requested",
        "step": "transition",
        "transition_request": transition_prompt,
    }


async def node_generate_transition(state: StoryboardState) -> dict[str, Any]:
    request = (state.get("transition_request") or "").strip()
    master = state.get("master_url") or ""
    if not request or not master:
        return {"phase": "transition_skipped", "step": "process", "transition_panels": []}

    full_prompt = (
        f"{TRANSITION_SYSTEM_PROMPT}\n\nMAIN STORYBOARD CONTEXT: {state.get('working_prompt') or ''}\n\n"
        f"TRANSITION REQUEST: {request}"
    )
    try:
        # Image editing with master as reference keeps style consistent.
        url, _, _, usage = await gateway.generate_image_editing(full_prompt, "16:9", master, None)
        count, _, usage2 = await gateway.analyze_storyboard_or_default(
            url, default_panel_count=4, max_panels=8
        )
        count = max(1, min(8, count))
        panels: list[str] = []
        errors: list[str] = []
        usage_acc = _merge_usage(usage, usage2)
        for index in range(count):
            try:
                panel_url, _, _, panel_usage = await gateway.generate_image_editing(
                    _extraction_prompt(index, columns=2, kind="transition"),
                    "16:9",
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
            "errors": [str(exc)],
        }


async def node_await_process(state: StoryboardState) -> dict[str, Any]:
    """Human gate: run AI panel extract, or submit locally extracted / demo panels."""
    decision = interrupt(
        {
            "type": "process_panels",
            "step": "process",
            "message": "Extract panels with AI, load demo panels, or continue with your own cuts.",
            "masterUrl": state.get("master_url"),
            "panelCount": state.get("panel_count"),
            "transitionPanels": state.get("transition_panels") or [],
            "processedPanels": state.get("processed_panels") or [],
        }
    )
    if not isinstance(decision, dict):
        return {"phase": "process_await", "step": "process"}

    action = decision.get("action") or "submit_processed"
    if action == "run_process":
        return {"phase": "process_requested", "step": "process", "waiting_for": ""}

    raw = decision.get("panels") or []
    panels: list[str] = []
    for item in raw:
        if isinstance(item, str) and item.strip():
            panels.append(item.strip())
        elif isinstance(item, dict):
            url = str(item.get("imageUrl") or item.get("image_url") or "").strip()
            if url:
                panels.append(url)

    if not panels:
        return {
            "phase": "process_await",
            "step": "process",
            "errors": ["Provide at least one processed panel, or run AI extract"],
        }

    return {
        "processed_panels": panels,
        "phase": "process_ready",
        "step": "selection",
        "waiting_for": "",
    }


async def node_process_panels(state: StoryboardState) -> dict[str, Any]:
    master = state.get("master_url") or ""
    count = int(state.get("panel_count") or 0)
    if not master or count <= 0:
        return {"errors": ["Cannot process panels without master/count"], "phase": "process_failed", "step": "process"}

    panels: list[str] = []
    errors: list[str] = []
    usage_acc: dict[str, int] = {}
    for index in range(count):
        try:
            url, _, _, usage = await gateway.generate_image_editing(
                _extraction_prompt(index, columns=3, kind="main"),
                "16:9",
                master,
                None,
            )
            panels.append(url)
            usage_acc = _merge_usage(usage_acc, usage)
        except Exception as exc:
            errors.append(str(exc))
            break

    if panels:
        return {
            "processed_panels": panels,
            "phase": "process_ready",
            "step": "selection",
            "errors": errors,
            "usage": usage_acc,
        }

    return {
        "processed_panels": [],
        "phase": "process_failed",
        "step": "process",
        "errors": errors or ["Panel extraction produced no images"],
        "usage": usage_acc,
    }


async def node_await_selection(state: StoryboardState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "select_panels",
            "step": "selection",
            "message": "Build the final sequence from processed and transition frames.",
            "masterUrl": state.get("master_url"),
            "processedPanels": state.get("processed_panels") or [],
            "transitionPanels": state.get("transition_panels") or [],
        }
    )
    if not isinstance(decision, dict) or decision.get("action") != "submit_selection":
        return {"errors": ["Selection required"], "phase": "failed", "step": "selection"}

    raw_panels = decision.get("panels") or []
    selected: list[PanelState] = []
    for i, item in enumerate(raw_panels):
        if isinstance(item, str):
            selected.append({"index": i, "imageUrl": item, "prompt": "", "duration": 8})
        elif isinstance(item, dict):
            selected.append(
                {
                    "index": i,
                    "imageUrl": str(item.get("imageUrl") or item.get("image_url") or ""),
                    "linkedImageUrl": str(item.get("linkedImageUrl") or item.get("linked_image_url") or ""),
                    "prompt": str(item.get("prompt") or ""),
                    "duration": int(item.get("duration") or 8),
                    "videoUrl": str(item.get("videoUrl") or item.get("video_url") or ""),
                }
            )

    selected = [p for p in selected if p.get("imageUrl")]
    if not selected:
        return {"errors": ["Select at least one panel"], "phase": "failed", "step": "selection"}

    return {
        "panels": selected,
        "phase": "selection_ready",
        "step": "result",
    }


async def node_await_produce(state: StoryboardState) -> dict[str, Any]:
    decision = interrupt(
        {
            "type": "confirm_produce",
            "step": "result",
            "message": "Confirm video generation for the selected sequence.",
            "panels": state.get("panels") or [],
            "workingPrompt": state.get("working_prompt"),
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
            "use_fast_video": bool(decision.get("useFastVideo", _opts(state).get("use_fast_video", True))),
        },
    }


async def node_produce(state: StoryboardState) -> dict[str, Any]:
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
                    panel_prompt=prompt,
                )
                current["prompt"] = prompt
                usage_acc = _merge_usage(usage_acc, usage)
            except Exception as exc:
                errors.append(f"panel[{panel.get('index')}] prompt failed: {exc}")

        prompt = (current.get("prompt") or "").strip() or master_desc or "Cinematic motion"
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



def _after_master_review(state: StoryboardState) -> Literal["generate_master", "await_transition_input", "__end__"]:
    if state.get("phase") == "failed":
        return "__end__"
    if state.get("phase") == "revise_master":
        return "generate_master"
    return "await_transition_input"


def _after_transition_input(state: StoryboardState) -> Literal["generate_transition", "await_process"]:
    if state.get("phase") == "transition_requested":
        return "generate_transition"
    return "await_process"


def _after_await_process(state: StoryboardState) -> Literal["process_panels", "await_selection", "await_process"]:
    phase = state.get("phase") or ""
    if phase == "process_requested":
        return "process_panels"
    if phase == "process_ready" and (state.get("processed_panels") or []):
        return "await_selection"
    return "await_process"


def _after_process_panels(state: StoryboardState) -> Literal["await_selection", "await_process"]:
    if state.get("phase") == "process_ready" and (state.get("processed_panels") or []):
        return "await_selection"
    return "await_process"


def _after_produce_gate(state: StoryboardState) -> Literal["produce", "__end__"]:
    if state.get("phase") == "produce_requested":
        return "produce"
    return "__end__"


def build_storyboard_graph():
    graph = StateGraph(StoryboardState)

    graph.add_node("prepare", node_prepare)
    graph.add_node("enhance_text", node_enhance_text)
    graph.add_node("generate_master", node_generate_master)
    graph.add_node("await_master_review", node_await_master_review)
    graph.add_node("await_transition_input", node_await_transition_input)
    graph.add_node("generate_transition", node_generate_transition)
    graph.add_node("await_process", node_await_process)
    graph.add_node("process_panels", node_process_panels)
    graph.add_node("await_selection", node_await_selection)
    graph.add_node("await_produce", node_await_produce)
    graph.add_node("produce", node_produce)

    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "enhance_text")
    graph.add_edge("enhance_text", "generate_master")
    graph.add_edge("generate_master", "await_master_review")
    graph.add_conditional_edges(
        "await_master_review",
        _after_master_review,
        {
            "generate_master": "generate_master",
            "await_transition_input": "await_transition_input",
            "__end__": END,
        },
    )
    graph.add_conditional_edges(
        "await_transition_input",
        _after_transition_input,
        {
            "generate_transition": "generate_transition",
            "await_process": "await_process",
        },
    )
    graph.add_edge("generate_transition", "await_process")
    graph.add_conditional_edges(
        "await_process",
        _after_await_process,
        {
            "process_panels": "process_panels",
            "await_selection": "await_selection",
            "await_process": "await_process",
        },
    )
    graph.add_conditional_edges(
        "process_panels",
        _after_process_panels,
        {
            "await_selection": "await_selection",
            "await_process": "await_process",
        },
    )
    graph.add_edge("await_selection", "await_produce")
    graph.add_conditional_edges(
        "await_produce",
        _after_produce_gate,
        {"produce": "produce", "__end__": END},
    )
    graph.add_edge("produce", END)

    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)


_GRAPH = None


def get_storyboard_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_storyboard_graph()
    return _GRAPH


def _serialize_state(values: dict[str, Any] | None) -> dict[str, Any]:
    values = values or {}
    return {
        "prompt": values.get("prompt"),
        "workingPrompt": values.get("working_prompt"),
        "masterUrl": values.get("master_url") or None,
        "panelCount": values.get("panel_count") or 0,
        "analysis": values.get("analysis") or "",
        "transitionUrl": values.get("transition_url") or None,
        "transitionPanels": values.get("transition_panels") or [],
        "processedPanels": values.get("processed_panels") or [],
        "panels": values.get("panels") or [],
        "step": values.get("step") or "prompt",
        "phase": values.get("phase") or "",
        "waitingFor": values.get("waiting_for") or "",
        "errors": values.get("errors") or [],
        "usage": values.get("usage")
        or {"promptTokens": 0, "completionTokens": 0, "cachedTokens": 0, "totalTokens": 0},
    }


def _extract_interrupt(result: dict[str, Any] | Any) -> dict[str, Any] | None:
    # astream/ainvoke may return __interrupt__
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
    graph = get_storyboard_graph()
    config = {"configurable": {"thread_id": thread_id}}

    interrupt_payload: dict[str, Any] | None = None
    async for event in graph.astream(payload, config, stream_mode="updates"):
        if not isinstance(event, dict):
            continue
        for node_out in event.values():
            if isinstance(node_out, dict) and "__interrupt__" in node_out:
                interrupt_payload = _extract_interrupt(node_out)
            # LangGraph may surface interrupts at top-level in some versions
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
    interrupted = bool(inter or interrupt_payload or (snap and snap.next))
    status = "interrupted" if interrupted else "completed"
    # Only surface failed when the graph is not paused for human input.
    if values.get("phase") == "failed" and not interrupted:
        status = "failed"

    return {
        "engine": "langgraph",
        "threadId": thread_id,
        "status": status,
        "waitingFor": waiting or values.get("waiting_for") or "",
        "interrupt": inter or interrupt_payload,
        "state": _serialize_state(dict(values) if values else {}),
    }


async def start_storyboard_session(
    prompt: str,
    *,
    master_url: str | None = None,
    options: StoryboardOptions | None = None,
) -> dict[str, Any]:
    opts: StoryboardOptions = {
        "enhance_text": False,
        "aspect_ratio": "3:2",
        "max_panels": 6,
        "use_fast_video": True,
    }
    if options:
        opts.update(options)

    thread_id = str(uuid.uuid4())
    return await _run_until_pause(
        thread_id,
        {
            "prompt": prompt,
            "master_url": master_url or "",
            "options": opts,
            "errors": [],
            "panels": [],
            "phase": "started",
            "step": "prompt",
        },
    )


async def resume_storyboard_session(thread_id: str, decision: dict[str, Any]) -> dict[str, Any]:
    return await _run_until_pause(thread_id, Command(resume=decision))


async def get_storyboard_session(thread_id: str) -> dict[str, Any]:
    graph = get_storyboard_graph()
    config = {"configurable": {"thread_id": thread_id}}
    snap = await graph.aget_state(config)
    if not snap or not snap.values:
        return {
            "engine": "langgraph",
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
    interrupted = bool(inter or snap.next)
    status = "interrupted" if interrupted else "completed"
    if values.get("phase") == "failed" and not interrupted:
        status = "failed"

    return {
        "engine": "langgraph",
        "threadId": thread_id,
        "status": status,
        "waitingFor": (inter or {}).get("type", "") if inter else "",
        "interrupt": inter,
        "state": _serialize_state(values),
    }


# Backward-compatible helper (non-HITL one-shot is no longer the default path)
async def run_storyboard_pipeline(prompt: str, *, options: StoryboardOptions | None = None) -> StoryboardState:
    started = await start_storyboard_session(prompt, options=options)
    # Auto-approve gates with safe defaults for legacy callers
    thread_id = started["threadId"]
    current = started
    auto_actions = [
        {"action": "approve_master"},
        {"action": "skip_transition"},
        {
            "action": "submit_selection",
            "panels": [
                {"imageUrl": url, "prompt": "", "duration": 8}
                for url in (current.get("state") or {}).get("processedPanels") or []
            ],
        },
        {"action": "skip_produce"},
    ]
    # Drive through interrupts if present
    for _ in range(8):
        if current.get("status") != "interrupted":
            break
        waiting = current.get("waitingFor")
        decision: dict[str, Any]
        if waiting == "review_master":
            decision = {"action": "approve_master"}
        elif waiting == "transition_input":
            decision = {"action": "skip_transition"}
        elif waiting == "process_panels":
            decision = {"action": "run_process"}
        elif waiting == "select_panels":
            panels = (current.get("state") or {}).get("processedPanels") or []
            decision = {
                "action": "submit_selection",
                "panels": [{"imageUrl": u, "prompt": "", "duration": 8} for u in panels],
            }
        elif waiting == "confirm_produce":
            decision = {"action": "skip_produce"}
        else:
            break
        current = await resume_storyboard_session(thread_id, decision)

    state = current.get("state") or {}
    return {
        "prompt": state.get("prompt") or prompt,
        "working_prompt": state.get("workingPrompt") or prompt,
        "master_url": state.get("masterUrl") or "",
        "panel_count": state.get("panelCount") or 0,
        "analysis": state.get("analysis") or "",
        "panels": state.get("panels") or [],
        "phase": state.get("phase") or current.get("status") or "",
        "errors": state.get("errors") or [],
        "options": options or {},
        "step": state.get("step") or "result",
    }
