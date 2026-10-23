# Patterns

<!-- Lazy-loaded — loaded only when a task references a known pattern or composition.
     Document validated component and layout patterns so the skill can reuse them
     without reinventing. Each pattern includes a description, where it's used, and
     any usage constraints. -->

No component patterns have been documented here yet. Before adding an entry,
inspect the existing implementation and record its source path, actual usage,
and constraints. Use [the design brief](brief.md) and [token inventory](tokens.md)
for established project guidance.

## Error notices

Use `ui/error-notice/ErrorNoticeComponent` for persistent page, form, modal, and chat errors. Pass a plain-text message, optional title and heading level, and an optional recovery label/output. Keep request state and recovery behavior in the consuming feature. The notice uses the existing destructive token for its icon and subtle surface tint, normal foreground text for contrast, and the shared secondary button. Render it only while an error exists so its alert announcement is meaningful. Preview examples at `/theme-showcase#error-notices`.

## Toast notifications

The theme showcase and production workflows use the same `ToastService` and global `layout/toast-outlet` renderer. Use persistent error toasts for failed event saves and feedback actions; dismiss the prior failure when retrying or leaving its owning view. Keep validation, unavailable page content, chat recovery controls, and confirmation-dialog errors inline. Avoid announcing the same failure through both channels. Error toasts persist by default; other variants keep their timed dismissal.
