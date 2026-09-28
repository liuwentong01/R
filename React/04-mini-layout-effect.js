/**
 * useLayoutEffect 与 useEffect：render / commit / paint 时序
 *
 * 运行：node React/04-mini-layout-effect.js
 *
 * 本模型展示常见路径：DOM mutation -> layout effects -> 浏览器绘制机会 -> passive effects。
 * 真实 React 不保证每个 useEffect 都严格在 paint 后：交互触发的 effect，或 layout effect
 * 中的同步更新，可能让 passive effect 更早执行。稳定保证是 useLayoutEffect 会阻塞重绘，
 * useEffect 不应被用于必须阻止闪烁的布局工作。
 */

let currentFiber = null;
let hookIndex = 0;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFiber() {
  return { hooks: [], layoutJobs: [], passiveJobs: [], dom: null };
}

function depsEqual(nextDeps, prevDeps) {
  return Boolean(
    nextDeps &&
      prevDeps &&
      nextDeps.length === prevDeps.length &&
      nextDeps.every((dep, index) => Object.is(dep, prevDeps[index]))
  );
}

function prepareToRender(fiber) {
  currentFiber = fiber;
  hookIndex = 0;
  fiber.layoutJobs = [];
  fiber.passiveJobs = [];
}

function registerEffect(tag, setup, deps) {
  let hook = currentFiber.hooks[hookIndex];
  if (!hook) {
    hook = { tag, deps: undefined, cleanup: null };
    currentFiber.hooks[hookIndex] = hook;
  } else if (hook.tag !== tag) {
    throw new Error("Hook 调用顺序发生变化");
  }

  if (!depsEqual(deps, hook.deps)) {
    const job = { hook, setup, deps };
    (tag === "layout" ? currentFiber.layoutJobs : currentFiber.passiveJobs).push(job);
  }
  hookIndex++;
}

function useLayoutEffect(setup, deps) {
  registerEffect("layout", setup, deps);
}

function useEffect(setup, deps) {
  registerEffect("passive", setup, deps);
}

function runEffectJobs(jobs) {
  // 更新时先销毁所有旧 effect，再创建所有新 effect，贴近 commit 的两段处理。
  for (const { hook } of jobs) {
    if (typeof hook.cleanup === "function") hook.cleanup();
  }
  for (const { hook, setup, deps } of jobs) {
    const cleanup = setup();
    hook.cleanup = typeof cleanup === "function" ? cleanup : null;
    hook.deps = deps;
  }
}

async function commitFiber(fiber) {
  console.log("  1. [mutation] 提交 DOM 变更");
  runEffectJobs(fiber.layoutJobs);
  console.log("  3. [paint opportunity] layout effect 已结束，浏览器现在可以绘制");

  // 只为演示 passive effect 被延后到一次绘制机会之后；setTimeout 不是 React
  // 对外承诺的调度实现，真实交互路径也可能在 paint 前刷新 passive effect。
  await nextTask();
  runEffectJobs(fiber.passiveJobs);
}

async function render(Component, props, fiber) {
  prepareToRender(fiber);
  console.log(`[render] props.count=${props.count}`);
  fiber.dom = Component(props);
  if (hookIndex !== fiber.hooks.length) {
    throw new Error("Hook 调用数量发生变化");
  }
  currentFiber = null;
  await commitFiber(fiber);
}

async function unmountFiber(fiber) {
  console.log("  [unmount] 清理 layout effect（DOM 仍可访问）");
  for (const hook of fiber.hooks) {
    if (hook.tag === "layout" && typeof hook.cleanup === "function") hook.cleanup();
  }
  console.log("  [unmount] 移除 DOM");
  await nextTask();
  console.log("  [unmount] 清理 passive effect");
  for (const hook of fiber.hooks) {
    if (hook.tag === "passive" && typeof hook.cleanup === "function") hook.cleanup();
  }
  fiber.hooks = [];
  fiber.dom = null;
}

const events = [];

function Demo({ count }) {
  console.log("  0. [render] 计算 JSX；这里必须保持纯");

  useLayoutEffect(() => {
    events.push(`layout setup ${count}`);
    console.log(`  2. [layout setup] 读取/修正布局，count=${count}`);
    return () => {
      events.push(`layout cleanup ${count}`);
      console.log(`     [layout cleanup] 旧 count=${count}`);
    };
  }, [count]);

  useEffect(() => {
    events.push(`passive setup ${count}`);
    console.log(`  4. [passive setup] 同步外部系统，count=${count}`);
    return () => {
      events.push(`passive cleanup ${count}`);
      console.log(`     [passive cleanup] 旧 count=${count}`);
    };
  }, [count]);

  return { type: "div", text: `count=${count}` };
}

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log("=== Effect 时序 ===\n");
  const fiber = createFiber();

  console.log("挂载：");
  await render(Demo, { count: 0 }, fiber);

  console.log("\n依赖变化：");
  await render(Demo, { count: 1 }, fiber);
  assertEqual(
    events.slice(2).join(" -> "),
    "layout cleanup 0 -> layout setup 1 -> passive cleanup 0 -> passive setup 1",
    "每类 effect 都先清理旧值再执行新 setup"
  );

  const eventCount = events.length;
  console.log("\n依赖未变化：");
  await render(Demo, { count: 1 }, fiber);
  assertEqual(events.length, eventCount, "依赖相同不重复执行 effect");

  console.log("\n卸载：");
  await unmountFiber(fiber);

  console.log("\n面试速记：");
  console.log("1. render 必须纯；effect setup/cleanup 都属于提交后的副作用处理。");
  console.log("2. useLayoutEffect 在 DOM 更新后、重绘前同步执行，会阻塞 paint；只用于布局测量/同步修正。");
  console.log("3. useEffect 是 passive effect，不阻塞 paint；通常用于订阅、网络连接、定时器等外部系统。");
  console.log("4. 依赖变化时先用旧闭包 cleanup，再用新闭包 setup；卸载也 cleanup。");
  console.log("5. 依赖用 Object.is 逐项比较；不传数组会每次执行，[] 表示只订阅挂载/卸载周期。");
  console.log("6. Effects 只在客户端运行；服务端没有可供 useLayoutEffect 测量的布局。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
