/**
 * React.lazy + Suspense 状态机（教学模型）
 *
 * 重要边界：下面用 try/catch 模拟“reconciler 发现 render 抛出的值”。真实 Suspense
 * 不是一个在函数组件体内写 try/catch 的实现；React reconciler 会沿 Fiber 树找到最近
 * 边界、渲染 fallback，并在 thenable settle 后安排重试。
 *
 * 运行：node React/11-mini-lazy-suspense.js
 */

const assert = require("node:assert/strict");

const LAZY_TYPE = Symbol("mini.lazy");
const UNINITIALIZED = -1;
const PENDING = 0;
const RESOLVED = 1;
const REJECTED = 2;

function lazy(load) {
  if (typeof load !== "function") throw new TypeError("load 必须是函数");
  return {
    $$typeof: LAZY_TYPE,
    _payload: { status: UNINITIALIZED, result: load },
  };
}

function initializeLazy(payload) {
  if (payload.status === UNINITIALIZED) {
    const load = payload.result;
    try {
      const thenable = load();
      if (!isThenable(thenable)) {
        throw new TypeError("lazy loader 必须返回 Promise 或 thenable");
      }
      payload.status = PENDING;
      payload.result = thenable;
      thenable.then(
        (module) => {
          if (payload.status !== PENDING) return;
          payload.status = RESOLVED;
          payload.result = module;
        },
        (error) => {
          if (payload.status !== PENDING) return;
          payload.status = REJECTED;
          payload.result = error;
        }
      );
    } catch (error) {
      payload.status = REJECTED;
      payload.result = error;
    }
  }

  if (payload.status === RESOLVED) {
    const Component = payload.result?.default;
    if (typeof Component !== "function") {
      throw new TypeError("lazy loader 必须 resolve 为含 default 组件的模块对象");
    }
    return Component;
  }
  // Pending 抛 thenable；Rejected 抛 error。二者由不同边界语义处理。
  throw payload.result;
}

function renderElement(element) {
  if (typeof element === "string" || typeof element === "number") return String(element);
  if (element?.$$typeof === LAZY_TYPE) {
    const Component = initializeLazy(element._payload);
    return renderElement(Component());
  }
  if (typeof element === "function") return renderElement(element());
  throw new TypeError("教学 renderer 只支持文本、函数组件和 lazy 类型");
}

function isThenable(value) {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function";
}

/**
 * 返回 fallback，并暴露 retry Promise 方便 Node 演示。真实 React 会自行安排重渲染。
 */
function renderWithSuspense(children, fallback) {
  try {
    return { status: "content", output: renderElement(children), retry: null };
  } catch (thrownValue) {
    if (!isThenable(thrownValue)) throw thrownValue;
    const retryRender = () => renderWithSuspense(children, fallback);
    return {
      status: "fallback",
      output: fallback,
      // resolve/reject 都重试；拒绝后 lazy 会改为 REJECTED，重试时抛 error。
      retry: Promise.resolve(thrownValue).then(retryRender, retryRender),
    };
  }
}

// ----------------------------------------------------------------------------
// 面试必答
// ----------------------------------------------------------------------------
//
// - lazy(load) 在首次尝试渲染时才调用 load，并缓存 thenable 与最终模块；load 不会每次
//   render 重跑。lazy 声明应放在模块顶层，否则每次创建新组件类型会重置子树 state。
// - pending thenable 让最近 Suspense 显示 fallback；resolve 后重试并读取 module.default。
// - reject 后错误交给最近 Error Boundary，不是永远停在 Suspense fallback。
// - Suspense 不会感知 Effect/event handler 里的普通 fetch。React 19 可用 use(promise)
//   读取稳定/缓存的 Promise，或使用支持 Suspense 的框架数据源；render 中每次新建 Promise
//   会导致重复挂起。
// - 已显示内容在更新时再次挂起，可能被 fallback 替换；用 Transition/deferred value
//   发起非紧急更新可保留已显示内容，避免闪烁。

async function runDemo() {
  let loadCount = 0;
  const LazyProfile = lazy(() => {
    loadCount++;
    return Promise.resolve({
      default: () => "Profile content",
    });
  });

  const first = renderWithSuspense(LazyProfile, "Loading...");
  assert.equal(first.status, "fallback");
  assert.equal(first.output, "Loading...");

  const second = await first.retry;
  assert.deepEqual(second, {
    status: "content",
    output: "Profile content",
    retry: null,
  });
  assert.equal(renderWithSuspense(LazyProfile, "Loading...").status, "content");
  assert.equal(loadCount, 1, "loader 与结果都应缓存");

  const LazyBroken = lazy(() => Promise.reject(new Error("chunk load failed")));
  const brokenFirst = renderWithSuspense(LazyBroken, "Loading...");
  await assert.rejects(brokenFirst.retry, /chunk load failed/);

  console.log("lazy/Suspense tests passed");
}

if (require.main === module) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { lazy, initializeLazy, renderWithSuspense };
