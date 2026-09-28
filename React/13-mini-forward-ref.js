/**
 * ref、forwardRef 与 useImperativeHandle（React 18 / 19 边界版）
 *
 * 高频结论：
 * 1. ref 是命令式逃生舱；能用 props 表达的状态不要放进 ref。
 * 2. React 18 及更早版本：函数组件接收 ref 需要 forwardRef(render)。
 * 3. React 19：函数组件可以直接从 props 读取 ref，forwardRef 已不再必需；
 *    官方说明它会在未来版本弃用，但 React 19 仍可使用它。
 * 4. useImperativeHandle(ref, createHandle, deps) 用来限制父组件可见的能力。
 * 5. ref 的挂载/清理发生在 Commit；useImperativeHandle 按 layout effect 语义处理，
 *    不应在 Render 阶段修改父级 ref。
 * 6. React 19 的回调 ref 可以返回清理函数；若返回了清理函数，卸载时不会再
 *    额外调用 ref(null)。
 *
 * 本文件是教学模拟，不是 React 源码：只实现对象 ref、回调 ref、useRef、
 * forwardRef 和 layout-effect 风格的 useImperativeHandle，不实现 DOM/Fiber 调度。
 * 运行：node React/13-mini-forward-ref.js
 */

const FORWARD_REF_TYPE = Symbol.for("mini-react.forward_ref");

let currentlyRenderingFiber = null;
let hookIndex = 0;

function prepareHooks(fiber) {
  currentlyRenderingFiber = fiber;
  hookIndex = 0;
  fiber.hooks ??= [];
  // Render 写临时 Hook 列表；只有 Commit 后才替换已提交列表。
  fiber.workInProgressHooks = [];
  fiber.pendingLayoutEffects = [];
}

function finishHooks() {
  currentlyRenderingFiber = null;
}

function assertRendering(hookName) {
  if (!currentlyRenderingFiber) {
    throw new Error(`${hookName} 只能在组件渲染期间调用。`);
  }
}

function areHookInputsEqual(nextDeps, previousDeps) {
  if (nextDeps === undefined || previousDeps === undefined) return false;
  if (nextDeps.length !== previousDeps.length) return false;
  return nextDeps.every((value, index) => Object.is(value, previousDeps[index]));
}

function attachRef(ref, value) {
  if (ref == null) return () => {};

  if (typeof ref === "function") {
    const cleanup = ref(value);
    if (cleanup !== undefined && typeof cleanup !== "function") {
      throw new TypeError("回调 ref 只能返回清理函数或 undefined。");
    }
    // React 19：有显式 cleanup 就使用它；否则保留传统的 ref(null) 清理语义。
    return cleanup ?? (() => ref(null));
  }

  if (typeof ref === "object") {
    ref.current = value;
    return () => {
      ref.current = null;
    };
  }

  throw new TypeError("ref 必须是回调、{ current } 对象或 null。");
}

function useRef(initialValue) {
  assertRendering("useRef");
  const oldHook = currentlyRenderingFiber.hooks[hookIndex];
  if (oldHook && oldHook.tag !== "ref") {
    throw new Error("Hook 调用顺序发生变化；当前位置上次不是 useRef。");
  }
  const hook = oldHook ?? { tag: "ref", value: { current: initialValue } };
  currentlyRenderingFiber.workInProgressHooks[hookIndex++] = hook;
  return hook.value;
}

/**
 * 关键模拟：Render 只登记 effect；commitLayoutEffects 才创建 handle 并写入 ref。
 * deps 省略时每次提交都重建；传 [] 时通常只在挂载/卸载时处理。
 * React 内部也会把 ref 自身的变化视作需要重新处理。
 */
function useImperativeHandle(ref, createHandle, deps) {
  assertRendering("useImperativeHandle");
  if (typeof createHandle !== "function") {
    throw new TypeError("createHandle 必须是函数。");
  }
  if (deps !== undefined && !Array.isArray(deps)) {
    throw new TypeError("deps 必须是数组或省略。");
  }

  const fiber = currentlyRenderingFiber;
  const oldHook = fiber.hooks[hookIndex];
  if (oldHook && oldHook.tag !== "imperativeHandle") {
    throw new Error("Hook 调用顺序发生变化；当前位置上次不是 useImperativeHandle。");
  }
  const refChanged = !oldHook || oldHook.ref !== ref;
  const depsChanged = !oldHook || !areHookInputsEqual(deps, oldHook.deps);
  const hook = {
    tag: "imperativeHandle",
    ref,
    deps,
    cleanup: oldHook?.cleanup ?? null,
    handle: oldHook?.handle ?? null,
  };

  if (refChanged || depsChanged) {
    fiber.pendingLayoutEffects.push(() => {
      hook.cleanup?.();

      const handle = createHandle();
      const detachRef = attachRef(ref, handle);
      hook.handle = handle;
      hook.cleanup = () => {
        detachRef();
        hook.handle = null;
      };
    });
  }

  fiber.workInProgressHooks[hookIndex++] = hook;
}

function createRef() {
  return { current: null };
}

/** React 18 风格：返回一种特殊组件类型，renderer 会把 ref 作为第二个参数传入。 */
function forwardRef(render) {
  if (typeof render !== "function") {
    throw new TypeError("forwardRef(render) 的 render 必须是函数。");
  }
  return { $$typeof: FORWARD_REF_TYPE, render };
}

function renderForwardRefComponent(Component, props, ref, fiber) {
  if (Component.$$typeof !== FORWARD_REF_TYPE) {
    throw new TypeError("这里只能渲染教学版 forwardRef 组件。");
  }

  prepareHooks(fiber);
  try {
    fiber.output = Component.render(props, ref);
    if (fiber.hasCommitted && hookIndex !== fiber.hooks.length) {
      throw new Error("Hook 调用数量发生变化；不要在条件或循环中调用 Hook。");
    }
    return fiber.output;
  } finally {
    finishHooks();
  }
}

/** 模拟 commit layout 阶段；被放弃的 Render 不调用它，因此不会写入父级 ref。 */
function commitLayoutEffects(fiber) {
  const effects = fiber.pendingLayoutEffects;
  fiber.pendingLayoutEffects = [];
  for (const effect of effects) effect();
  fiber.hooks = fiber.workInProgressHooks;
  fiber.workInProgressHooks = [];
  fiber.hasCommitted = true;
}

function unmountFiber(fiber) {
  for (const hook of fiber.hooks ?? []) hook.cleanup?.();
  fiber.hooks = [];
  fiber.workInProgressHooks = [];
  fiber.pendingLayoutEffects = [];
  fiber.hasCommitted = false;
}

function createHostInput(defaultValue = "") {
  return {
    value: defaultValue,
    focus() {
      console.log("  [host] input.focus()");
    },
    clear() {
      this.value = "";
    },
    setValue(value) {
      this.value = value;
    },
  };
}

const FancyInput = forwardRef((props, ref) => {
  const inputRef = useRef(null);
  inputRef.current ??= createHostInput(props.defaultValue);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current.focus(),
      clear: () => inputRef.current.clear(),
      getValue: () => inputRef.current.value,
      setValue: (value) => inputRef.current.setValue(value),
      isDisabled: () => Boolean(props.disabled),
    }),
    [props.disabled],
  );

  return inputRef.current;
});

// React 19 的业务代码通常可写成：
// function FancyInput19({ ref, disabled }) {
//   useImperativeHandle(ref, () => ({ focus() { /* ... */ } }), [disabled]);
//   return <input />;
// }

console.log("=== ref / useImperativeHandle 教学模拟 ===\n");

const parentRef = createRef();
const fiber = { hooks: [], pendingLayoutEffects: [] };

renderForwardRefComponent(
  FancyInput,
  { defaultValue: "hello", disabled: false },
  parentRef,
  fiber,
);
console.log("Render 后、Commit 前 ref.current:", parentRef.current); // null
commitLayoutEffects(fiber);
console.log("Commit 后暴露的方法:", Object.keys(parentRef.current));
parentRef.current.setValue("React");
console.log("getValue():", parentRef.current.getValue());

const previousHandle = parentRef.current;
renderForwardRefComponent(FancyInput, { disabled: false }, parentRef, fiber);
commitLayoutEffects(fiber);
console.log("deps 不变，handle 身份复用:", previousHandle === parentRef.current);

renderForwardRefComponent(FancyInput, { disabled: true }, parentRef, fiber);
commitLayoutEffects(fiber);
console.log("deps 变化，handle 重建:", previousHandle !== parentRef.current);
console.log("isDisabled():", parentRef.current.isDisabled());

unmountFiber(fiber);
console.log("卸载后 ref.current:", parentRef.current); // null

const callbackRefLog = [];
const callbackRef = (handle) => {
  callbackRefLog.push(handle ? "attach" : "null");
  return () => callbackRefLog.push("cleanup");
};
const callbackFiber = { hooks: [], pendingLayoutEffects: [] };
renderForwardRefComponent(FancyInput, {}, callbackRef, callbackFiber);
commitLayoutEffects(callbackFiber);
unmountFiber(callbackFiber);
console.log("React 19 回调 ref 清理:", callbackRefLog.join(" → ")); // attach → cleanup

console.log("\n面试主线：声明式优先；ref 用于 focus、滚动、测量、媒体控制等命令式操作。");
console.log("版本边界：React 18 用 forwardRef；React 19 可把 ref 直接作为 prop 接收。");
