<template>
  <div class="skeleton-editor">
    <div class="skeleton-toolbar">
      <div class="skeleton-line skeleton-pulse" style="width: 100px; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 60px; height: 22px; border-radius: 11px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 80px; height: 12px; margin-left: auto;" />
    </div>
    <div class="skeleton-content">
      <div class="skeleton-line skeleton-pulse" style="width: 90%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 100%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 75%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 85%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 60%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 95%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 70%; height: 14px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 88%; height: 14px;" />
    </div>
    <div class="skeleton-bottom-bar">
      <div class="skeleton-line skeleton-pulse" style="width: 80px; height: 32px; border-radius: 4px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 60px; height: 32px; border-radius: 4px;" />
      <div class="skeleton-line skeleton-pulse" style="width: 60px; height: 32px; border-radius: 4px;" />
    </div>
  </div>
</template>

<style scoped>
.skeleton-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.skeleton-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--nw-border);
}

.skeleton-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
}

.skeleton-bottom-bar {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--nw-border);
}

.skeleton-line {
  background: var(--nw-border);
  border-radius: 6px;
}
</style>
