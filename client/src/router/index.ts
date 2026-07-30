import { createRouter, createWebHistory } from "vue-router"

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "landing", component: () => import("@/views/LandingView.vue") },
    { path: "/storyboard", name: "storyboard", component: () => import("@/views/StoryboardView.vue") },
    { path: "/ads", name: "ads", component: () => import("@/views/AdsView.vue") },
    {
      path: "/image-playground",
      name: "image-playground",
      component: () => import("@/views/ImagePlaygroundView.vue"),
    },
    { path: "/timeline", name: "timeline", component: () => import("@/views/TimelineView.vue") },
    { path: "/demo", name: "demo", component: () => import("@/views/DemoView.vue") },
    { path: "/workspace", name: "workspace", component: () => import("@/views/WorkspaceView.vue") },
    { path: "/usage", name: "usage", component: () => import("@/views/UsageView.vue") },
    { path: "/library", name: "library", component: () => import("@/views/LibraryView.vue") },
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
    { path: "/profile", name: "profile", component: () => import("@/views/ProfileView.vue") },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
