<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { WbsTask } from './types';

  export let tasks: WbsTask[] = [];
  export let selectedTaskId: string | null = null;

  const dispatch = createEventDispatcher();

  /** カレンダービューモード */
  let viewMode: 'month' | 'week' = 'month';

  /** 現在表示している年月 */
  let currentDate = new Date();
  let currentYear = currentDate.getFullYear();
  let currentMonth = currentDate.getMonth();

  /** 週の開始日 */
  let weekStartDate = getWeekStart(currentDate);

  /** 月の日付配列を生成 */
  function getMonthDays(year: number, month: number): Date[] {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // 週の始まり（日曜日）に調整

    const days: Date[] = [];
    const current = new Date(startDate);

    // 6週分の日付を生成（カレンダーの標準的な表示）
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /** 週の開始日を取得 */
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  /** 週の日付配列を生成 */
  function getWeekDays(startDate: Date): Date[] {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }

  /** 日付文字列をDateオブジェクトに変換 */
  function parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr);
  }

  /** 日付が同じかチェック */
  function isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /** 特定の日付のタスクを取得 */
  function getTasksForDate(date: Date): WbsTask[] {
    return flatTasks.filter(task => {
      const taskDate = parseDate(task.endDate);
      return taskDate && isSameDay(date, taskDate);
    });
  }

  /** タスクツリーをフラット化 */
  function flattenTasks(taskList: WbsTask[]): WbsTask[] {
    let result: WbsTask[] = [];
    for (const task of taskList) {
      result.push(task);
      if (task.children.length > 0) {
        result = result.concat(flattenTasks(task.children));
      }
    }
    return result;
  }

  /** 前の月/週に移動 */
  function navigatePrevious() {
    if (viewMode === 'month') {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
    } else {
      weekStartDate = new Date(weekStartDate);
      weekStartDate.setDate(weekStartDate.getDate() - 7);
    }
  }

  /** 次の月/週に移動 */
  function navigateNext() {
    if (viewMode === 'month') {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    } else {
      weekStartDate = new Date(weekStartDate);
      weekStartDate.setDate(weekStartDate.getDate() + 7);
    }
  }

  /** 今日に戻る */
  function goToToday() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    weekStartDate = getWeekStart(today);
  }

  /** ビューモードを切り替え */
  function setViewMode(mode: 'month' | 'week') {
    viewMode = mode;
  }

  /** タスククリックイベント */
  function handleTaskClick(task: WbsTask) {
    dispatch('select', task);
  }

  /** 優先度に応じた色を取得 */
  function getPriorityColor(priority?: 'high' | 'medium' | 'low' | 'none'): string {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  }

  /** ステータスに応じた色を取得 */
  function getStatusColor(status?: WbsTask['status']): string {
    switch (status) {
      case 'completed': return '#10b981';
      case 'in-progress': return '#3b82f6';
      case 'in-review': return '#8b5cf6';
      case 'blocked': return '#ef4444';
      case 'planning': return '#f59e0b';
      default: return '#9ca3af';
    }
  }

  /** 日付が今日かどうか */
  function isToday(date: Date): boolean {
    const today = new Date();
    return isSameDay(date, today);
  }

  /** 日付が現在の月かどうか（月表示時） */
  function isCurrentMonth(date: Date): boolean {
    return date.getMonth() === currentMonth;
  }

  /** 表示する日付配列 */
  $: displayDays = viewMode === 'month'
    ? getMonthDays(currentYear, currentMonth)
    : getWeekDays(weekStartDate);

  /** 現在の表示タイトル */
  $: displayTitle = viewMode === 'month'
    ? `${currentYear}年 ${currentMonth + 1}月`
    : `${weekStartDate.getFullYear()}年 ${weekStartDate.getMonth() + 1}月 ${weekStartDate.getDate()}日の週`;

  /** フラット化されたタスク（メモ化：パフォーマンス改善用） */
  $: flatTasks = flattenTasks(tasks);
</script>

<div class="calendar-view">
  <div class="calendar-header">
    <div class="calendar-nav">
      <button type="button" class="nav-btn" on:click={navigatePrevious}>
        <i class="bi bi-chevron-left"></i>
      </button>
      <h2 class="calendar-title">{displayTitle}</h2>
      <button type="button" class="nav-btn" on:click={navigateNext}>
        <i class="bi bi-chevron-right"></i>
      </button>
      <button type="button" class="today-btn" on:click={goToToday}>
        今日
      </button>
    </div>
    <div class="view-mode-toggle">
      <button
        type="button"
        class="mode-btn"
        class:active={viewMode === 'month'}
        on:click={() => setViewMode('month')}
      >
        月
      </button>
      <button
        type="button"
        class="mode-btn"
        class:active={viewMode === 'week'}
        on:click={() => setViewMode('week')}
      >
        週
      </button>
    </div>
  </div>

  <div class="calendar-grid" class:week-view={viewMode === 'week'}>
    <!-- 曜日ヘッダー -->
    <div class="weekday-header">
      {#each ['日', '月', '火', '水', '木', '金', '土'] as day}
        <div class="weekday">{day}</div>
      {/each}
    </div>

    <!-- 日付とタスク -->
    <div class="days-grid">
      {#each displayDays as day}
        <div
          class="day-cell"
          class:today={isToday(day)}
          class:other-month={viewMode === 'month' && !isCurrentMonth(day)}
        >
          <div class="day-number">{day.getDate()}</div>
          <div class="day-tasks">
            {#each getTasksForDate(day) as task}
              <button
                type="button"
                class="task-item"
                class:selected={task.id === selectedTaskId}
                style="border-left-color: {getPriorityColor(task.priority)}"
                on:click={() => handleTaskClick(task)}
              >
                <div class="task-name">{task.name}</div>
                {#if task.assignee}
                  <div class="task-assignee">
                    <i class="bi bi-person"></i>
                    {task.assignee}
                  </div>
                {/if}
                <div
                  class="task-status"
                  style="background: {getStatusColor(task.status)}"
                ></div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .calendar-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-radius: 12px;
    padding: 20px;
  }

  .calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .calendar-nav {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
    color: #374151;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  }

  .nav-btn:hover {
    background: #e5e7eb;
  }

  .calendar-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }

  .today-btn {
    padding: 8px 16px;
    border: 1px solid #3b82f6;
    border-radius: 8px;
    background: #ffffff;
    color: #3b82f6;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .today-btn:hover {
    background: #3b82f6;
    color: #ffffff;
  }

  .view-mode-toggle {
    display: flex;
    gap: 4px;
    background: #f3f4f6;
    padding: 4px;
    border-radius: 8px;
  }

  .mode-btn {
    padding: 6px 16px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #6b7280;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .mode-btn:hover {
    color: #374151;
  }

  .mode-btn.active {
    background: #ffffff;
    color: #111827;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .calendar-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .weekday-header {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 1px;
    background: #e5e7eb;
    border: 1px solid #e5e7eb;
    border-bottom: none;
    width: 100%;
    min-width: 0;
  }

  .weekday {
    background: #f9fafb;
    padding: 12px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    min-width: 0;
  }

  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 1px;
    background: #e5e7eb;
    border: 1px solid #e5e7eb;
    flex: 1;
    overflow-y: auto;
    width: 100%;
    min-width: 0;
    overflow-x: hidden;
  }

  .week-view .days-grid {
    grid-auto-rows: minmax(150px, 1fr);
  }

  .day-cell {
    background: #ffffff;
    padding: 8px;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
  }

  .day-cell.today {
    background: #eff6ff;
  }

  .day-cell.other-month {
    background: #f9fafb;
    opacity: 0.5;
  }

  .day-number {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 4px;
  }

  .day-cell.today .day-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #3b82f6;
    color: #ffffff;
  }

  .day-tasks {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    flex: 1;
    min-width: 0;
  }

  .task-item {
    position: relative;
    padding: 6px 8px;
    padding-left: 12px;
    border: 1px solid #e5e7eb;
    border-left-width: 4px;
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
    transition: background 0.2s ease, box-shadow 0.2s ease;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .task-item:hover {
    background: #f9fafb;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .task-item.selected {
    background: #dbeafe;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .task-name {
    font-size: 12px;
    font-weight: 600;
    color: #111827;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .task-assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #6b7280;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-status {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  @media (max-width: 768px) {
    .calendar-header {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .calendar-nav {
      justify-content: space-between;
    }

    .day-cell {
      min-height: 80px;
    }

    .task-name {
      font-size: 11px;
    }
  }
</style>
