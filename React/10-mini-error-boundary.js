/**
 * Error Boundary：渲染错误的最近边界与降级 UI
 *
 * 教学 renderer 只模拟 render 阶段错误和 commit 回调队列，不是 React Fiber 源码。
 * 运行：node React/10-mini-error-boundary.js
 */

const assert = require("node:assert/strict");
const capturedComponentStacks = new Map();

class ErrorBoundary {
  constructor(props) {
    this.props = props;
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    // 必须纯：render 阶段根据错误决定 fallback，不在这里上报。
    return { error };
  }

  componentDidCatch(error, info) {
    // commit 阶段做日志、监控等副作用。
    this.props.onError?.(error, info);
  }

  renderFallback() {
    const { fallback } = this.props;
    return typeof fallback === "function" ? fallback(this.state.error) : fallback;
  }
}

function createElement(type, props = {}) {
  return { type, props };
}

function renderNode(node, commitQueue, componentStack = []) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node == null) return "";

  if (node.type === ErrorBoundary) {
    const boundary = new ErrorBoundary(node.props);
    try {
      return renderNode(node.props.children, commitQueue, ["ErrorBoundary", ...componentStack]);
    } catch (error) {
      const capturedStack = capturedComponentStacks.get(error) ?? componentStack;
      capturedComponentStacks.delete(error);
      boundary.state = {
        ...boundary.state,
        ...ErrorBoundary.getDerivedStateFromError(error),
      };

      // fallback 自己若再抛错，会离开这个 catch，并由外层边界捕获。
      const output = renderNode(
        boundary.renderFallback(),
        commitQueue,
        ["ErrorBoundary(fallback)", ...componentStack]
      );
      commitQueue.push(() =>
        boundary.componentDidCatch(error, {
          componentStack: capturedStack.map((name) => `\n    at ${name}`).join(""),
        })
      );
      return output;
    }
  }

  if (typeof node.type === "function") {
    const name = node.type.displayName || node.type.name || "Anonymous";
    const nextStack = [name, ...componentStack];
    try {
      return renderNode(node.type(node.props), commitQueue, nextStack);
    } catch (error) {
      if (!capturedComponentStacks.has(error)) capturedComponentStacks.set(error, nextStack);
      throw error;
    }
  }
  throw new TypeError("教学 renderer 只支持文本、函数组件和 ErrorBoundary");
}

function renderTree(root) {
  const commitQueue = [];
  const output = renderNode(root, commitQueue);
  commitQueue.forEach((commit) => commit());
  return output;
}

// ----------------------------------------------------------------------------
// 面试必答
// ----------------------------------------------------------------------------
//
// 真实写法是 Class 组件：
//
//   static getDerivedStateFromError(error) { return { error }; }
//   componentDidCatch(error, info) { report(error, info.componentStack); }
//
// 截至 React 19，React 没有用于“定义 Error Boundary”的函数组件 Hook。可以自己保留
// 一个 Class 边界，或使用库封装。普通 try/catch 包住 JSX 不能捕获之后由 React 调用
// 子组件 render 时的错误。
//
// 【能捕获】
// - 后代组件 render、constructor、相关生命周期中的错误；
// - React.lazy 拒绝、React 19 use(promise) 拒绝在 render 中暴露出的错误；
// - useTransition 返回的 startTransition Action 内交给 React 的错误。
//
// 【不能捕获】
// - 该边界自身（包括自己的 fallback）抛出的错误；它只能由更外层边界捕获；
// - 普通事件处理器；应在事件逻辑中 try/catch 或处理 Promise rejection；
// - setTimeout、requestAnimationFrame 等脱离 React 工作栈的普通异步回调；
// - 服务端渲染错误。SSR/Streaming 要使用框架或 server renderer 的错误回调。
//
// Error Boundary 一旦进入 error state，不会凭空恢复。常见重试方式是清空其 error state，
// 或改变边界 key 使其重新挂载。边界粒度按产品降级单元划分（页面、侧栏、卡片），
// 不是每个小组件都包一层。
//
// React 19 的 createRoot/hydrateRoot 可配置 onCaughtError/onUncaughtError/
// onRecoverableError 做根级上报；它们不提供局部 fallback，因此不替代 Error Boundary。

function BuggyWidget() {
  throw new Error("widget crashed");
}

function runDemo() {
  const reports = [];
  const tree = createElement(ErrorBoundary, {
    fallback: (error) => `Fallback: ${error.message}`,
    onError: (error, info) => reports.push({ error, info }),
    children: createElement(BuggyWidget),
  });
  assert.equal(renderTree(tree), "Fallback: widget crashed");
  assert.equal(reports.length, 1);
  assert.match(reports[0].info.componentStack, /BuggyWidget/);

  // 内层 fallback 出错时，内层不能捕获自身；外层边界接管。
  const nested = createElement(ErrorBoundary, {
    fallback: "Outer fallback",
    children: createElement(ErrorBoundary, {
      fallback: () => {
        throw new Error("inner fallback crashed");
      },
      children: createElement(BuggyWidget),
    }),
  });
  assert.equal(renderTree(nested), "Outer fallback");

  // 事件在 React render 调用栈之外，边界不会包住它。
  const eventHandler = () => {
    throw new Error("event crashed");
  };
  assert.throws(eventHandler, /event crashed/);

  console.log("Error Boundary tests passed");
}

if (require.main === module) runDemo();

module.exports = { ErrorBoundary, createElement, renderTree };
