/**
 * Virtual List：只渲染视口附近的列表项
 *
 * 面试主线：固定高度 O(1) 定位、overscan、总高度占位、内容偏移；变高列表再补
 * “预估 + 测量 + 前缀位置 + 二分查找 + 滚动锚定”。这里计算区间统一使用
 * [start, endExclusive)，避免常见的多渲染一项错误。
 *
 * 运行：node React/15-mini-virtual-list.js
 */

const assert = require("node:assert/strict");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

class FixedSizeList {
  constructor({ itemCount, itemHeight, viewportHeight, overscan = 3 }) {
    if (!Number.isInteger(itemCount) || itemCount < 0) throw new RangeError("itemCount 非法");
    if (!(itemHeight > 0) || !(viewportHeight > 0)) throw new RangeError("高度必须大于 0");
    this.itemCount = itemCount;
    this.itemHeight = itemHeight;
    this.viewportHeight = viewportHeight;
    this.overscan = Math.max(0, Math.floor(overscan));
  }

  get totalHeight() {
    return this.itemCount * this.itemHeight;
  }

  getRange(scrollTop) {
    if (this.itemCount === 0) {
      return { start: 0, end: 0, visibleStart: 0, visibleEnd: 0, offset: 0 };
    }

    // 浏览器回弹可能给出负值；数据变化也可能让旧 scrollTop 超过新总高度。
    const maxScrollTop = Math.max(0, this.totalHeight - this.viewportHeight);
    const safeScrollTop = clamp(scrollTop, 0, maxScrollTop);
    const visibleStart = Math.floor(safeScrollTop / this.itemHeight);
    const visibleEnd = Math.min(
      this.itemCount,
      Math.ceil((safeScrollTop + this.viewportHeight) / this.itemHeight)
    );
    const start = Math.max(0, visibleStart - this.overscan);
    const end = Math.min(this.itemCount, visibleEnd + this.overscan);

    return {
      start,
      end,
      visibleStart,
      visibleEnd,
      offset: start * this.itemHeight,
    };
  }
}

function lowerBound(sortedValues, target) {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sortedValues[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

class VariableSizeList {
  constructor({ itemCount, estimatedItemHeight, viewportHeight, overscan = 3 }) {
    if (!Number.isInteger(itemCount) || itemCount < 0) throw new RangeError("itemCount 非法");
    if (!(estimatedItemHeight > 0) || !(viewportHeight > 0)) {
      throw new RangeError("高度必须大于 0");
    }
    this.itemCount = itemCount;
    this.viewportHeight = viewportHeight;
    this.overscan = Math.max(0, Math.floor(overscan));
    this.heights = Array(itemCount).fill(estimatedItemHeight);
    // offsets[i] 是第 i 项 top，offsets[itemCount] 是总高度。
    this.offsets = Array.from(
      { length: itemCount + 1 },
      (_, index) => index * estimatedItemHeight
    );
  }

  get totalHeight() {
    return this.offsets[this.itemCount];
  }

  /** 更新测量高度。教学版向后修正 O(n)；成熟库会分块缓存或只维护已测量区间。 */
  updateHeight(index, measuredHeight) {
    if (index < 0 || index >= this.itemCount) throw new RangeError("index 越界");
    if (!(measuredHeight > 0)) throw new RangeError("measuredHeight 必须大于 0");
    const delta = measuredHeight - this.heights[index];
    if (delta === 0) return 0;

    this.heights[index] = measuredHeight;
    for (let i = index + 1; i <= this.itemCount; i++) this.offsets[i] += delta;
    return delta;
  }

  findItemAt(offset) {
    if (this.itemCount === 0) return 0;
    let low = 0;
    let high = this.itemCount;
    // 第一个 bottom(offsets[i + 1]) > offset 的 item。
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.offsets[middle + 1] <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.min(low, this.itemCount - 1);
  }

  getRange(scrollTop) {
    if (this.itemCount === 0) {
      return { start: 0, end: 0, visibleStart: 0, visibleEnd: 0, offset: 0 };
    }

    const maxScrollTop = Math.max(0, this.totalHeight - this.viewportHeight);
    const safeScrollTop = clamp(scrollTop, 0, maxScrollTop);
    const visibleStart = this.findItemAt(safeScrollTop);
    // 第一个 top >= viewportBottom 的索引，即可视区结束（exclusive）。
    const visibleEnd = Math.min(
      this.itemCount,
      lowerBound(this.offsets, safeScrollTop + this.viewportHeight)
    );
    const start = Math.max(0, visibleStart - this.overscan);
    const end = Math.min(this.itemCount, visibleEnd + this.overscan);

    return { start, end, visibleStart, visibleEnd, offset: this.offsets[start] };
  }
}

// ----------------------------------------------------------------------------
// React 落地时的关键点
// ----------------------------------------------------------------------------
//
// DOM 结构通常是：
//
//   scroll container（固定 height + overflow:auto）
//     spacer（height: totalHeight; position:relative）
//       visible items（absolute top，或一个 translateY 后的连续内容层）
//
// scrollTop 变化后只 slice [start, end)，并使用数据的稳定 id 作为 key，而不是“当前
// 窗口下标”。overscan 用少量额外 DOM 换快速滚动稳定性，越大越平滑但渲染越重。
//
// 变高列表用 ResizeObserver/布局测量更新高度。若视口上方某项高度变化 delta，应同步
// 把 scrollTop 调整 delta，保持用户正在看的内容不跳动（scroll anchoring）。大量 scroll
// 事件可按 animation frame 合并；不要在每次事件中测量整表造成 layout thrashing。
//
// 还要处理：容器 resize、数据插入/删除后的缓存失效、焦点与键盘导航、ARIA 语义、
// sticky 项和 SSR 初始高度。虚拟化减少 DOM 数，不会自动减少数据、图片或请求的内存。

function runDemo() {
  const fixed = new FixedSizeList({
    itemCount: 10_000,
    itemHeight: 50,
    viewportHeight: 500,
    overscan: 3,
  });
  assert.deepEqual(fixed.getRange(0), {
    start: 0,
    end: 13,
    visibleStart: 0,
    visibleEnd: 10,
    offset: 0,
  });
  assert.deepEqual(fixed.getRange(75), {
    start: 0,
    end: 15,
    visibleStart: 1,
    visibleEnd: 12,
    offset: 0,
  });

  const variable = new VariableSizeList({
    itemCount: 4,
    estimatedItemHeight: 50,
    viewportHeight: 100,
    overscan: 0,
  });
  variable.updateHeight(0, 80);
  variable.updateHeight(1, 30);
  assert.deepEqual(variable.offsets, [0, 80, 110, 160, 210]);
  assert.deepEqual(variable.getRange(80), {
    start: 1,
    end: 4,
    visibleStart: 1,
    visibleEnd: 4,
    offset: 80,
  });

  console.log("Virtual list tests passed");
  console.log(`10000 项固定高度列表在顶部只需渲染 ${fixed.getRange(0).end} 项`);
}

if (require.main === module) runDemo();

module.exports = { FixedSizeList, VariableSizeList, lowerBound };
