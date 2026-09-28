/**
 * Redux middleware：增强 dispatch 的洋葱模型
 *
 * 核心 store 复用 09-mini-redux.js。本文件只保留高频的 compose、applyMiddleware、
 * thunk、logger；Promise middleware 与“吞掉 reducer 异常”的 crash middleware
 * 不是面试主线，且后者容易隐藏数据错误，故删除。
 *
 * 运行：node React/14-mini-redux-middleware.js
 */

const assert = require("node:assert/strict");
const { createStore } = require("./09-mini-redux");

function compose(...functions) {
  if (functions.length === 0) return (value) => value;
  if (functions.length === 1) return functions[0];
  return functions.reduce(
    (outer, inner) =>
      (...args) =>
        outer(inner(...args))
  );
}

/**
 * middleware 签名：({ getState, dispatch }) => next => action => result
 *
 * - next(action)：进入链中下一环，最终到原始 dispatch。
 * - dispatch(action)：从增强后的整条链重新开始，thunk 内常用。
 * - 必须 return next(action) 的结果，否则会破坏 dispatch 返回值与调用方 await。
 */
function applyMiddleware(...middlewares) {
  return (baseCreateStore) => (reducer, preloadedState) => {
    const store = baseCreateStore(reducer, preloadedState);
    let dispatch = () => {
      throw new Error("middleware 构造期间不能 dispatch");
    };

    const middlewareAPI = {
      getState: store.getState,
      // 闭包不能直接写 dispatch 属性值，否则中间件拿到的是构造期占位函数。
      dispatch: (action) => dispatch(action),
    };

    const chain = middlewares.map((middleware) => middleware(middlewareAPI));
    dispatch = compose(...chain)(store.dispatch);
    return { ...store, dispatch };
  };
}

const thunk =
  ({ dispatch, getState }) =>
  (next) =>
  (action) => {
    if (typeof action === "function") return action(dispatch, getState);
    return next(action);
  };

const logger =
  ({ getState }) =>
  (next) =>
  (action) => {
    const previousState = getState();
    console.log("[logger] action:", action.type);
    const result = next(action);
    console.log("[logger] state:", previousState, "->", getState());
    return result;
  };

// applyMiddleware(a, b) 得到 a(b(originalDispatch))：action 进入顺序 a -> b，
// 返回顺序 b -> a。这常被称为洋葱模型。中间件处理副作用；reducer 始终保持纯函数。

function runDemo() {
  const trace = [];
  const mark = (name) => () => (next) => (action) => {
    trace.push(`${name}:before`);
    const result = next(action);
    trace.push(`${name}:after`);
    return result;
  };

  function reducer(state = 0, action) {
    if (action.type === "add") return state + action.payload;
    return state;
  }

  const store = createStore(
    reducer,
    applyMiddleware(thunk, mark("A"), mark("B"))
  );

  const thunkResult = store.dispatch((dispatch, getState) => {
    dispatch({ type: "add", payload: 2 });
    return getState();
  });

  assert.equal(thunkResult, 2, "thunk 应透传函数返回值");
  assert.deepEqual(trace, ["A:before", "B:before", "B:after", "A:after"]);
  console.log("Mini middleware tests passed");
  console.log("执行顺序:", trace.join(" -> "));
}

if (require.main === module) runDemo();

module.exports = { compose, applyMiddleware, thunk, logger };
