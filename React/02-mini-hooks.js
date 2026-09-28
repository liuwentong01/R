/**
 * Hooks 核心机制：useState / useReducer / useMemo / useCallback / useRef / Context
 *
 * 运行：node React/02-mini-hooks.js
 *
 * 面试先讲真实 React，再看本文件的简化：
 * - 每个函数组件 Fiber 的 memoizedState 指向 Hook 单链表；更新时按调用顺序配对。
 * - state 更新进入该 Hook 的 update queue，调度一次 render；render 时按顺序计算新状态。
 * - 本文件用数组代替链表，不实现 Lane、并发中断、eager bailout 和真实 Context 传播。
 */

let currentFiber = null;
let hookIndex = 0;
let isMount = false;

function createFiber() {
  return {
    hooks: [],
    contextDependencies: new Set(),
    schedule: null,
    mounted: false,
  };
}

function prepareToRender(fiber, onSchedule = null) {
  currentFiber = fiber;
  hookIndex = 0;
  isMount = !fiber.mounted;
  fiber.contextDependencies.clear();
  if (onSchedule) fiber.schedule = onSchedule;
}

function finishRender() {
  if (!isMount && hookIndex !== currentFiber.hooks.length) {
    throw new Error("Hook 调用数量或顺序与上一次渲染不一致");
  }
  currentFiber.mounted = true;
  currentFiber = null;
}

function getHook() {
  if (!currentFiber) {
    throw new Error("Hook 只能在组件渲染期间调用");
  }

  if (isMount) {
    currentFiber.hooks.push({ memoizedState: undefined, queue: null });
  }

  const hook = currentFiber.hooks[hookIndex];
  if (!hook) {
    throw new Error("Hook 调用数量或顺序与上一次渲染不一致");
  }
  hookIndex++;
  return hook;
}

function basicStateReducer(state, action) {
  return typeof action === "function" ? action(state) : action;
}

/**
 * useReducer(reducer, initialArg, init?)
 *
 * queue 和 dispatch 在多次 render 间保持同一引用。真实 React 还会给更新标注
 * 优先级（Lane），并可能在入队时做 eager bailout。
 */
function useReducer(reducer, initialArg, init) {
  const hook = getHook();

  if (isMount) {
    hook.memoizedState = init ? init(initialArg) : initialArg;
    const ownerFiber = currentFiber;
    const queue = { pending: [], dispatch: null };
    queue.dispatch = (action) => {
      queue.pending.push(action);
      if (ownerFiber.schedule) ownerFiber.schedule();
    };
    hook.queue = queue;
  }

  if (hook.queue.pending.length > 0) {
    let nextState = hook.memoizedState;
    for (const action of hook.queue.pending) {
      nextState = reducer(nextState, action);
    }
    hook.queue.pending = [];
    hook.memoizedState = nextState;
  }

  return [hook.memoizedState, hook.queue.dispatch];
}

/**
 * useState 是 basicStateReducer 的特化：
 * - setState(value) 替换该 state 值，不像 class this.setState 那样浅合并对象。
 * - setState(prev => next) 会按队列顺序消费前一次结果。
 * - 函数 initialState 只在 mount 时调用（懒初始化）。
 */
function useState(initialState) {
  return useReducer(
    basicStateReducer,
    initialState,
    (value) => (typeof value === "function" ? value() : value)
  );
}

function depsEqual(nextDeps, prevDeps) {
  if (!nextDeps || !prevDeps || nextDeps.length !== prevDeps.length) {
    return false;
  }
  return nextDeps.every((dep, index) => Object.is(dep, prevDeps[index]));
}

/**
 * useMemo 缓存计算结果。依赖逐项用 Object.is 比较；省略 deps 时每次重算。
 * 它是性能优化，不应把业务正确性建立在缓存永不失效之上。
 */
function useMemo(factory, deps) {
  const hook = getHook();

  if (!isMount) {
    const [previousValue, previousDeps] = hook.memoizedState;
    if (depsEqual(deps, previousDeps)) return previousValue;
  }

  const value = factory();
  hook.memoizedState = [value, deps];
  return value;
}

function useCallback(callback, deps) {
  return useMemo(() => callback, deps);
}

/** useRef 返回稳定容器；修改 current 不调度 render。 */
function useRef(initialValue) {
  const hook = getHook();
  if (isMount) hook.memoizedState = { current: initialValue };
  return hook.memoizedState;
}

/**
 * Context 的生产实现会维护 Provider 栈，并在消费 Fiber 上记录依赖。
 * 这里的 withProvider 用 try/finally 演示“进入 Provider -> 渲染子树 -> 恢复外层值”。
 */
function createContext(defaultValue) {
  return { defaultValue, currentValue: defaultValue };
}

function useContext(context) {
  if (!currentFiber) throw new Error("useContext 只能在组件渲染期间调用");
  currentFiber.contextDependencies.add(context);
  return context.currentValue;
}

function withProvider(context, value, renderChildren) {
  const previousValue = context.currentValue;
  context.currentValue = value;
  try {
    return renderChildren();
  } finally {
    context.currentValue = previousValue;
  }
}

// ---------------------------------------------------------------------------
// 可运行验证
// ---------------------------------------------------------------------------

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
  console.log(`  ✓ ${message}:`, actual);
}

console.log("=== Hooks 核心机制 ===");

const counterFiber = createFiber();
let lazyInitCalls = 0;
let scheduledUpdates = 0;

function Counter() {
  const [count, setCount] = useState(() => {
    lazyInitCalls++;
    return 0;
  });
  const doubled = useMemo(() => count * 2, [count]);
  const ref = useRef("stable");
  return { count, setCount, doubled, ref };
}

function renderCounter() {
  prepareToRender(counterFiber, () => {
    scheduledUpdates++;
  });
  const result = Counter();
  finishRender();
  return result;
}

let first = renderCounter();
const stableDispatch = first.setCount;
const stableRef = first.ref;
first.setCount((n) => n + 1);
first.setCount((n) => n + 1);
first.setCount(10);
first.setCount((n) => n + 5);

const second = renderCounter();
assertEqual(second.count, 15, "更新队列按顺序计算");
assertEqual(second.doubled, 30, "useMemo 在依赖变化时重算");
assertEqual(second.setCount === stableDispatch, true, "dispatch 引用稳定");
assertEqual(second.ref === stableRef, true, "ref 对象引用稳定");
assertEqual(lazyInitCalls, 1, "useState 懒初始化只执行一次");
assertEqual(scheduledUpdates, 4, "每次 dispatch 都请求调度更新");

function reducer(state, action) {
  if (action.type === "add") return state + action.value;
  return state;
}

const reducerFiber = createFiber();
prepareToRender(reducerFiber);
let [total, dispatch] = useReducer(reducer, 3, (n) => n * 2);
finishRender();
dispatch({ type: "add", value: 4 });
prepareToRender(reducerFiber);
[total] = useReducer(reducer, 0);
finishRender();
assertEqual(total, 10, "useReducer 支持 init 和 action 队列");

const ThemeContext = createContext("light");
const contextFiber = createFiber();
prepareToRender(contextFiber);
const contextResult = withProvider(ThemeContext, "dark", () => ({
  inside: useContext(ThemeContext),
  nested: withProvider(ThemeContext, "contrast", () => useContext(ThemeContext)),
}));
finishRender();
assertEqual(contextResult.inside, "dark", "读取最近 Provider 的值");
assertEqual(contextResult.nested, "contrast", "嵌套 Provider 覆盖外层值");
prepareToRender(contextFiber);
const restoredContext = useContext(ThemeContext);
finishRender();
assertEqual(restoredContext, "light", "离开 Provider 后恢复外层值");

console.log("\n面试速记：");
console.log("1. Hook 状态属于 Fiber，靠稳定调用顺序配对；不要放在条件、循环或普通回调里。");
console.log("2. state 是一次 render 的快照；连续依赖旧值的更新使用函数式写法。");
console.log("3. useState 替换值，class this.setState 浅合并对象；setter/dispatch 引用稳定。");
console.log("4. useMemo 缓存值，useCallback 缓存函数；二者都是性能优化，依赖用 Object.is 比较。");
console.log("5. useRef 跨 render 保持同一对象，写 current 不触发 render；不要在 render 中随意读写 DOM ref。");
console.log("6. Context 消费者订阅的是 value；Provider value 的 Object.is 结果变化会传播更新。");
