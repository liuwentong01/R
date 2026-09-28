/**
 * Mini Redux：store、reducer 与发布订阅
 *
 * 只实现面试最核心的 createStore / combineReducers。中间件单独放在
 * 14-mini-redux-middleware.js，避免重复。生产项目优先使用 Redux Toolkit；本文件不是
 * Redux 完整兼容实现（省略 Observable、DevTools 协议、随机探测 action 等细节）。
 *
 * 运行：node React/09-mini-redux.js
 */

const assert = require("node:assert/strict");

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  let proto = value;
  while (Object.getPrototypeOf(proto) !== null) proto = Object.getPrototypeOf(proto);
  const directPrototype = Object.getPrototypeOf(value);
  return directPrototype === proto || directPrototype === null;
}

function createStore(reducer, preloadedState, enhancer) {
  if (typeof reducer !== "function") throw new TypeError("reducer 必须是函数");

  // 支持 createStore(reducer, enhancer) 重载。
  if (typeof preloadedState === "function" && enhancer === undefined) {
    enhancer = preloadedState;
    preloadedState = undefined;
  }
  if (enhancer !== undefined) {
    if (typeof enhancer !== "function") throw new TypeError("enhancer 必须是函数");
    return enhancer(createStore)(reducer, preloadedState);
  }

  let currentReducer = reducer;
  let currentState = preloadedState;
  let currentListeners = new Map();
  let nextListeners = currentListeners;
  let nextListenerId = 0;
  let isDispatching = false;

  // subscribe/unsubscribe 期间复制，保证一次 dispatch 使用稳定快照。
  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) nextListeners = new Map(currentListeners);
  }

  function getState() {
    if (isDispatching) throw new Error("reducer 执行期间不能读取 store state");
    return currentState;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener 必须是函数");
    if (isDispatching) throw new Error("reducer 执行期间不能订阅");

    let subscribed = true;
    const id = nextListenerId++;
    ensureCanMutateNextListeners();
    nextListeners.set(id, listener);

    return function unsubscribe() {
      if (!subscribed) return;
      if (isDispatching) throw new Error("reducer 执行期间不能取消订阅");
      subscribed = false;
      ensureCanMutateNextListeners();
      nextListeners.delete(id);
    };
  }

  function dispatch(action) {
    // Redux core 接收 plain-object action；thunk 等其他值由中间件在到达这里前拦截。
    if (!isPlainObject(action)) throw new TypeError("action 必须是普通对象");
    if (typeof action.type !== "string") throw new TypeError("action.type 必须是字符串");
    if (isDispatching) throw new Error("reducer 中不能 dispatch");

    let nextState;
    try {
      isDispatching = true;
      nextState = currentReducer(currentState, action);
      if (nextState === undefined) throw new Error("reducer 不能返回 undefined");
    } finally {
      isDispatching = false;
    }
    currentState = nextState;

    currentListeners = nextListeners;
    for (const listener of currentListeners.values()) listener();
    return action;
  }

  function replaceReducer(nextReducer) {
    if (typeof nextReducer !== "function") throw new TypeError("nextReducer 必须是函数");
    currentReducer = nextReducer;
    dispatch({ type: "@@mini-redux/REPLACE" });
  }

  // 用内部 action 让 reducer 填充默认 state。
  dispatch({ type: "@@mini-redux/INIT" });
  return { dispatch, getState, subscribe, replaceReducer };
}

function combineReducers(reducerMap) {
  const keys = Object.keys(reducerMap).filter((key) => typeof reducerMap[key] === "function");

  return function combination(state = {}, action) {
    let hasChanged = keys.length !== Object.keys(state).length;
    const nextState = {};

    for (const key of keys) {
      const previousSlice = state[key];
      const nextSlice = reducerMap[key](previousSlice, action);
      if (nextSlice === undefined) {
        throw new Error(`reducer "${key}" 处理 ${action.type} 时返回了 undefined`);
      }
      nextState[key] = nextSlice;
      hasChanged ||= nextSlice !== previousSlice;
    }

    return hasChanged ? nextState : state;
  };
}

// ----------------------------------------------------------------------------
// React-Redux 面试连接点
// ----------------------------------------------------------------------------
//
// Redux store 与 React 没有天然关系。React-Redux 用 Context 传 store，并通过订阅让
// 组件在相关快照变化时重渲染；现代实现建立在 useSyncExternalStore 及选择器订阅之上。
// useSelector(selector, equalityFn) 只有在选中结果按比较规则变化时才需更新组件。
//
// 高频原则：
// - reducer 是 (previousState, action) => nextState 的纯函数；不能做请求、随机数等副作用。
// - “不可变更新”不是冻结一切，而是变化路径返回新引用，未变化路径复用旧引用。
// - subscribe 在每次 dispatch 后触发，不代表 state 一定变了；选择器负责缩小更新范围。
// - Redux Toolkit 是官方推荐写法；createSlice 内看似“修改”的语法由 Immer 生成不可变结果。
// - 服务端缓存/请求状态通常交给 RTK Query、TanStack Query 等，不必都塞进手写 thunk。

function runDemo() {
  function counter(state = 0, action) {
    if (action.type === "counter/increment") return state + action.payload;
    return state;
  }
  function todos(state = [], action) {
    if (action.type === "todos/add") return [...state, action.payload];
    return state;
  }

  const rootReducer = combineReducers({ counter, todos });
  const store = createStore(rootReducer);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);

  store.dispatch({ type: "counter/increment", payload: 2 });
  store.dispatch({ type: "todos/add", payload: "learn reducers" });
  unsubscribe();
  store.dispatch({ type: "counter/increment", payload: 3 });

  assert.deepEqual(store.getState(), {
    counter: 5,
    todos: ["learn reducers"],
  });
  assert.equal(notifications, 2);

  const same = rootReducer(store.getState(), { type: "unknown" });
  assert.equal(same, store.getState(), "所有 slice 未变时应复用根 state 引用");
  console.log("Mini Redux tests passed");
}

if (require.main === module) runDemo();

module.exports = { createStore, combineReducers, isPlainObject };
