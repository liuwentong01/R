/**
 * forwardRef + useImperativeHandle 手写实现
 *
 * ═══════════════════════════════════════════════════════
 *  为什么这是高频面试题？
 * ═══════════════════════════════════════════════════════
 *
 * 在 React 里，ref 默认只能直接拿到：
 *   1. DOM 节点
 *   2. Class 组件实例
 *
 * 但函数组件没有实例，所以：
 *   <MyFunctionComponent ref={xxx} />
 *
 * 默认是拿不到 ref 的。
 *
 * 这时就需要：
 *   1. forwardRef        —— 把父组件传入的 ref 继续往下转发
 *   2. useImperativeHandle —— 控制“到底暴露什么能力给父组件”
 *
 * 运行方式：node React/mini-forward-ref.js
 */

const FORWARD_REF_TYPE = Symbol("forward_ref");

// ── 极简 Hook 运行时 ────────────────────────────────────────────────────────

let currentFiber = null;
let hookIndex = 0;

function prepareHooks(fiber) {
  currentFiber = fiber;
  hookIndex = 0;
  fiber.hooks = fiber.hooks || [];
}

function depsEqual(nextDeps, prevDeps) {
  if (!nextDeps || !prevDeps) return false;
  if (nextDeps.length !== prevDeps.length) return false;
  for (let i = 0; i < nextDeps.length; i++) {
    if (!Object.is(nextDeps[i], prevDeps[i])) return false;
  }
  return true;
}

function useRef(initialValue) {
  const oldHook = currentFiber.hooks[hookIndex];
  const hook = oldHook || { memoizedState: { current: initialValue } };
  currentFiber.hooks[hookIndex] = hook;
  hookIndex++;
  return hook.memoizedState;
}

function useImperativeHandle(ref, createHandle, deps) {
  const oldHook = currentFiber.hooks[hookIndex];
  const changed = !oldHook || !depsEqual(deps, oldHook.deps);

  const hook = {
    deps,
    cleanup: oldHook?.cleanup || null,
  };

  if (changed) {
    if (typeof hook.cleanup === "function") {
      hook.cleanup();
    }

    const handle = createHandle();
    ref.current = handle;

    // 真实 React 在卸载时也会清空 ref；这里用 cleanup 模拟
    hook.cleanup = () => {
      ref.current = null;
    };
  } else {
    ref.current = oldHook.refValue;
  }

  hook.refValue = ref.current;
  currentFiber.hooks[hookIndex] = hook;
  hookIndex++;
}

// ── ref / forwardRef 实现 ───────────────────────────────────────────────────

function createRef() {
  return { current: null };
}

function forwardRef(render) {
  return {
    $$typeof: FORWARD_REF_TYPE,
    render,
  };
}

// ── 模拟宿主实例（真实 React 中这里会是 DOM 节点）────────────────────────────

function createHostInput(defaultValue = "") {
  return {
    value: defaultValue,
    focus() {
      console.log("  [host] input.focus()");
    },
    clear() {
      this.value = "";
      console.log("  [host] input.clear()");
    },
    setValue(value) {
      this.value = value;
      console.log(`  [host] input.value = "${value}"`);
    },
  };
}

// ── 极简渲染器：只关心 forwardRef 组件 ───────────────────────────────────────

function renderForwardRefComponent(Component, props, ref, fiber) {
  prepareHooks(fiber);
  const hostInstance = Component.render(props, ref);
  fiber.output = hostInstance;
  return hostInstance;
}

// ═══════════════════════════════════════════════════════════════════════════
// 组件实现：FancyInput
// ═══════════════════════════════════════════════════════════════════════════

const FancyInput = forwardRef((props, ref) => {
  const inputRef = useRef(null);

  if (!inputRef.current) {
    inputRef.current = createHostInput(props.defaultValue);
  }

  // 这里只暴露 focus / clear / getValue / setValue
  // 父组件拿不到整个“内部宿主节点”，只能用我们允许的方法
  useImperativeHandle(
    ref,
    () => ({
      focus() {
        inputRef.current.focus();
      },
      clear() {
        inputRef.current.clear();
      },
      getValue() {
        return inputRef.current.value;
      },
      setValue(value) {
        inputRef.current.setValue(value);
      },
      isDisabled() {
        return !!props.disabled;
      },
    }),
    [props.disabled]
  );

  return inputRef.current;
});

// ═══════════════════════════════════════════════════════════════════════════
// 测试 1：父组件通过 ref 调子组件暴露的命令式 API
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== forwardRef + useImperativeHandle ===\n");

const parentRef = createRef();
const fancyInputFiber = { hooks: [] };

console.log("【测试 1】首次渲染");
renderForwardRefComponent(FancyInput, { defaultValue: "hello", disabled: false }, parentRef, fancyInputFiber);

console.log("  parentRef.current 暴露的方法:", Object.keys(parentRef.current));
parentRef.current.focus();
console.log('  getValue() =>', parentRef.current.getValue());
parentRef.current.setValue("React");
console.log('  getValue() =>', parentRef.current.getValue());
parentRef.current.clear();
console.log('  getValue() =>', parentRef.current.getValue());

// ═══════════════════════════════════════════════════════════════════════════
// 测试 2：更新渲染，deps 变化后重新生成 handle
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 2】更新渲染（disabled 变化）");
renderForwardRefComponent(FancyInput, { defaultValue: "ignored", disabled: true }, parentRef, fancyInputFiber);
console.log("  isDisabled() =>", parentRef.current.isDisabled());

// ═══════════════════════════════════════════════════════════════════════════
// 测试 3：为什么不直接暴露整个内部节点？
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 3】封装边界");
console.log("  是否能直接访问内部 value？", "value" in parentRef.current);
console.log("  说明：父组件拿到的是“我们主动暴露的 handle”，不是内部完整实例");

console.log("\n\n=== 面试要点 ===");
console.log("1. 函数组件默认没有实例，所以 ref 不能直接挂在普通函数组件上");
console.log("2. forwardRef 的作用是把父组件传入的 ref 继续转发下去");
console.log("3. useImperativeHandle 的作用是定制 ref.current，而不是把内部实现全暴露出去");
console.log("4. forwardRef 常和 useImperativeHandle 配合：输入框 focus、弹窗 open、滚动定位等");
console.log("5. useImperativeHandle 的 deps 变化时会重新生成 handle，不变时可复用旧 handle");
console.log("6. 这是 React 里少数“命令式逃生舱”，能不用就不用，但需要时非常重要");
