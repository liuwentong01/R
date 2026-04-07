/**
 * useLayoutEffect vs useEffect 手写时序模拟
 *
 * ═══════════════════════════════════════════════════════
 *  为什么这是高频面试题？
 * ═══════════════════════════════════════════════════════
 *
 * 很多 React 面试都会问：
 *   1. useEffect 和 useLayoutEffect 有什么区别？
 *   2. 它们分别在 render / commit 的哪个阶段执行？
 *   3. 为什么有时 useEffect 会导致页面“闪一下”？
 *
 * 这个文件不依赖浏览器，而是用一个极简 Fiber + Effect 队列模型，
 * 演示两类 effect 在 commit 阶段的执行顺序。
 *
 * 运行方式：node React/mini-layout-effect.js
 */

let currentFiber = null;
let hookIndex = 0;

function depsEqual(nextDeps, prevDeps) {
  if (!nextDeps || !prevDeps) return false;
  if (nextDeps.length !== prevDeps.length) return false;
  for (let i = 0; i < nextDeps.length; i++) {
    if (!Object.is(nextDeps[i], prevDeps[i])) return false;
  }
  return true;
}

function createFiber() {
  return {
    hooks: [],
    pendingLayoutEffects: [],
    pendingPassiveEffects: [],
    pendingLayoutCleanups: [],
    pendingPassiveCleanups: [],
    dom: null,
  };
}

function prepareToRender(fiber) {
  currentFiber = fiber;
  hookIndex = 0;
  fiber.pendingLayoutEffects = [];
  fiber.pendingPassiveEffects = [];
  fiber.pendingLayoutCleanups = [];
  fiber.pendingPassiveCleanups = [];
}

function mountEffect(tag, create, deps) {
  const oldHook = currentFiber.hooks[hookIndex];
  const changed = !oldHook || !depsEqual(deps, oldHook.deps);

  const hook = {
    tag,
    deps,
    create,
    cleanup: oldHook?.cleanup || null,
  };

  if (changed) {
    if (typeof oldHook?.cleanup === "function") {
      if (tag === "layout") {
        currentFiber.pendingLayoutCleanups.push(oldHook.cleanup);
      } else {
        currentFiber.pendingPassiveCleanups.push(oldHook.cleanup);
      }
    }

    if (tag === "layout") {
      currentFiber.pendingLayoutEffects.push(hook);
    } else {
      currentFiber.pendingPassiveEffects.push(hook);
    }
  }

  currentFiber.hooks[hookIndex] = hook;
  hookIndex++;
}

function useLayoutEffect(create, deps) {
  mountEffect("layout", create, deps);
}

function useEffect(create, deps) {
  mountEffect("passive", create, deps);
}

function commitFiber(fiber) {
  console.log("  [commit] 1. 提交 DOM 变更");

  fiber.pendingLayoutCleanups.forEach((cleanup) => cleanup());

  fiber.pendingLayoutEffects.forEach((hook) => {
    const cleanup = hook.create();
    hook.cleanup = typeof cleanup === "function" ? cleanup : null;
  });

  console.log("  [paint ] 2. 浏览器开始绘制");

  fiber.pendingPassiveCleanups.forEach((cleanup) => cleanup());

  fiber.pendingPassiveEffects.forEach((hook) => {
    const cleanup = hook.create();
    hook.cleanup = typeof cleanup === "function" ? cleanup : null;
  });
}

function render(Component, props, fiber) {
  prepareToRender(fiber);

  console.log(`[render] 开始 render，props.count = ${props.count}`);
  const dom = Component(props);
  fiber.dom = dom;
  commitFiber(fiber);
}

// ═══════════════════════════════════════════════════════════════════════════
// 示例组件
// ═══════════════════════════════════════════════════════════════════════════

function DemoComponent(props) {
  console.log("  [render] 计算 JSX / Fiber");

  useLayoutEffect(() => {
    console.log(`  [layout] 3. useLayoutEffect 执行，读取最新布局 count=${props.count}`);
    return () => {
      console.log(`  [layout-cleanup] 更新前清理旧 layout effect，count=${props.count}`);
    };
  }, [props.count]);

  useEffect(() => {
    console.log(`  [effect] 4. useEffect 执行（绘制后），count=${props.count}`);
    return () => {
      console.log(`  [effect-cleanup] 更新后清理旧 passive effect，count=${props.count}`);
    };
  }, [props.count]);

  return { type: "div", text: `count=${props.count}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试 1：首次挂载
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== useLayoutEffect vs useEffect ===\n");

const fiber = createFiber();

console.log("【测试 1】首次挂载");
render(DemoComponent, { count: 0 }, fiber);

// ═══════════════════════════════════════════════════════════════════════════
// 测试 2：依赖变化，观察 cleanup 和新 effect 顺序
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 2】更新渲染（count 从 0 变成 1）");
render(DemoComponent, { count: 1 }, fiber);

// ═══════════════════════════════════════════════════════════════════════════
// 测试 3：依赖不变，不重新执行 effect
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 3】依赖不变（count 仍然是 1）");
render(DemoComponent, { count: 1 }, fiber);

console.log("\n\n=== 面试要点 ===");
console.log("1. render 阶段负责计算 Fiber / JSX，必须纯；真正副作用发生在 commit 阶段");
console.log("2. useLayoutEffect 在 DOM 提交后、浏览器绘制前同步执行");
console.log("3. useEffect 在浏览器绘制后执行，属于 passive effect");
console.log("4. 更新时：先清理旧 layout effect，再执行新 layout effect；绘制后再清理和执行 passive effect");
console.log("5. 需要测量 DOM、同步修正布局、防止闪烁时用 useLayoutEffect");
console.log("6. 大多数副作用（请求、订阅、日志、定时器）优先用 useEffect");
console.log("7. useLayoutEffect 会阻塞绘制，不能滥用");
