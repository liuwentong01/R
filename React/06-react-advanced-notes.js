/**
 * React 18 / 19 进阶面试笔记
 *
 * 范围：只保留应用层高频内容。lazy、Error Boundary、Fiber、Scheduler 的完整
 * 演示分别放在对应 mini 文件中，这里不重复内部源码和不稳定的常量。
 *
 * 运行：node React/06-react-advanced-notes.js
 */

// ============================================================================
// 一、并发渲染：useTransition / useDeferredValue
// ============================================================================
//
// 先纠正三个常见误区：
//
// 1. “并发”不等于多线程。React 仍在主线程执行 JavaScript；并发渲染表示
//    render 工作可以被暂停、放弃、重做和按优先级调度。最终 commit 仍是同步的。
// 2. Transition 不是固定延时，也不是防抖。它把更新标为非紧急；React 可以先处理
//    点击、输入等紧急更新，并放弃尚未提交的过期中间渲染。
// 3. startTransition 不会把已经执行的昂贵 JavaScript 变快。下面这种写法中，
//    filterBigList() 在 setState 之前就同步算完了，包裹它没有意义：
//
//      startTransition(() => setList(filterBigList(query))); // 计算仍同步发生
//
// 【useTransition】
//
//   const [isPending, startTransition] = useTransition();
//
//   function selectTab(nextTab) {
//     startTransition(() => setTab(nextTab));
//   }
//
// - startTransition 的回调会立即执行；其中同步触发的 state 更新被标为 Transition。
// - Transition render 可被更紧急的更新打断并重启，适合导航、Tab、昂贵子树更新。
// - isPending 表示相关 Transition 尚未完成，可用于轻量的 pending 提示。
// - 不能把受控 input 自身的 value 更新放进 Transition；输入值必须立即同步更新。
// - React 19 允许把 async Action 交给 startTransition，并让 isPending 覆盖异步工作；
//   但 await 之后要被标记为 Transition 的 setState，在当前 API 限制下仍应再次包一层
//   startTransition（使用框架 Action 时通常由框架处理）。
//
// 【useDeferredValue】
//
//   const [query, setQuery] = useState("");
//   const deferredQuery = useDeferredValue(query);
//   return <MemoizedSlowList query={deferredQuery} />;
//
// - query 立即更新，所以 input 不会卡；慢列表先拿旧值，再在可中断的后台 render 中追上。
// - 它没有固定延时，内部也不能简单解释成“useEffect + startTransition”。
// - 常配合 memo 使用，否则父组件重渲染时慢子树仍可能做无用工作。
// - 它不会减少网络请求次数；需要减少请求仍用 debounce、缓存或请求取消。
//
// 【与 debounce 的区别】
//
// - debounce：按时间合并调用，常用于减少请求/计算次数。
// - Transition/deferred value：调度渲染优先级，目标是保持界面响应；可能跳过过期的
//   中间渲染，但不是一个基于毫秒数的限流器。
//
// 【React 18 自动批处理】
//
// createRoot 下，React 18 会对 React 事件、Promise、setTimeout、原生事件等来源的
// 多次 state 更新自动批处理，通常只 commit 一次。flushSync 是少数需要立刻读取更新后
// DOM 时的逃生舱，不应作为常规写法。批处理与 Transition 是两件事：前者合并更新，
// 后者区分紧急程度。

// ============================================================================
// 二、Suspense：代码、数据与异步边界
// ============================================================================
//
// Suspense 的公开语义是：“子树尚未准备好时显示 fallback”。可触发它的常见来源：
//
// - React.lazy 加载组件代码；
// - React 19 的 use(cachedPromise) 读取 Promise；
// - 支持 Suspense 的框架/数据源；
// - 流式 SSR 中尚未到达客户端的边界内容。
//
// 普通 useEffect(() => fetch(...)) 不会自动触发 Suspense。
//
// 底层可以概括为：render 读取未完成的 thenable 时挂起，reconciler 找到最近的
// Suspense 边界并切到 fallback，thenable settle 后安排重试。不要回答成
// “Suspense 函数组件内部写 try/catch”；边界处理发生在 React reconciler。
// Promise 拒绝时，拒因会在重试 render 时作为错误交给最近的 Error Boundary。
//
// React 19 的 use(promise)：
//
//   function Message({ messagePromise }) {
//     const message = use(messagePromise);
//     return <p>{message}</p>;
//   }
//
// - use 可以读取 Promise 和 Context；与普通 Hook 不同，它可出现在条件/循环中，
//   但仍必须在组件或 Hook 内调用，不能放进 try/catch。
// - Promise 必须来自稳定缓存、props 或框架；每次 render 新建 Promise 容易反复挂起。
// - Suspense 处理“等待”，Error Boundary 处理“失败”，生产中通常两者一起放置。
//
// 完整 lazy 状态机见 11-mini-lazy-suspense.js；错误边界见 10-mini-error-boundary.js。

// ============================================================================
// 三、SSR、Streaming 与 Hydration
// ============================================================================
//
// SSR：服务端先生成 HTML。Hydration：客户端用 hydrateRoot 把相同的 React 树与
// 既有 HTML 对应起来，恢复状态、事件与后续更新能力，而不是重新创建整棵 DOM。
//
//   // server: renderToPipeableStream(<App />)（Node）
//   // client: hydrateRoot(document.getElementById("root"), <App />)
//
// 【高频区别】
//
// - createRoot：用于纯客户端根，从零创建 DOM。
// - hydrateRoot：用于已有 React 服务端 HTML 的根；首次客户端输出必须与服务端一致。
// - Streaming SSR：服务端按块发送 HTML，Suspense 边界可先发送 fallback，内容就绪后
//   再继续流式输出。
// - Selective Hydration：客户端可按边界、代码就绪情况和用户交互优先级逐步 hydrate。
//
// 【Hydration mismatch 常见原因】
//
// - 首次 render 直接使用 Date.now()、Math.random()；
// - render 中按 typeof window、localStorage、matchMedia 生成不同结构；
// - 服务端与客户端初始数据不一致；
// - 非法 HTML 嵌套被浏览器修正，或扩展/第三方脚本改写 DOM。
//
// 修复原则：让两端首屏输出一致；客户端差异放到 Effect 后的第二次 render，或使用
// 框架提供的客户端边界。suppressHydrationWarning 只是一层深的逃生舱，而且 React
// 不保证修补不一致内容，不能拿它掩盖普通 bug。React 能从部分 mismatch 中恢复，
// 但恢复有成本，也可能导致整个边界改为客户端渲染。

// ============================================================================
// 四、React Server Components（RSC）与 SSR
// ============================================================================
//
// RSC 与 SSR 是正交能力，可以组合：
//
// - SSR 回答“怎样先得到 HTML”；客户端组件通常仍需下载 JS 并 hydrate。
// - RSC 回答“哪些组件在构建期/服务端环境求值”。Server Component 的组件实现
//   不进入浏览器 bundle；浏览器收到其渲染结果和 Client Component 模块引用。
// - RSC 的输出还可以继续做 SSR，生成首屏 HTML。
//
// 【边界规则】
//
// - Server Component 可直接访问服务端数据源，也可以是 async；不能使用 useState、
//   useEffect、浏览器 API 或事件处理器。
// - `"use client"` 标记模块边界；该模块及其传递依赖进入客户端模块图。不是每个
//   Client Component 文件都必须重复写指令，只需在边界入口写。
// - 没有 `"use server"` 组件指令；`"use server"` 标记的是 Server Function。
// - 跨 server/client 边界的 props 必须可序列化。Server Component 的渲染结果可以
//   通过 children 等 props 组合进 Client Component。
// - Client Component 名字表示“代码会发给客户端并可交互”，不表示它绝不在服务端
//   预渲染。
//
// React 19 稳定了面向应用作者的 Server Components 模型；自行实现 RSC bundler/
// framework 的底层接口仍可能在 19.x 小版本间变化，所以面试不应背内部 wire format。

// ============================================================================
// 五、React 19 高频新增：Actions 与乐观更新
// ============================================================================
//
// 【Action】
//
// React 19 用 “Action” 描述包含数据提交、pending、错误和乐观状态的异步流程。
// 它不是 Redux action。常见 API：
//
// - useActionState(action, initialState)：保存 Action 返回状态，同时给出 formAction 与
//   isPending；适合表单校验结果/服务端返回值。
// - useFormStatus()：在 <form> 的后代中读取最近父 form 的 pending/data/method/action。
// - useOptimistic(state, updateFn)：请求完成前立即显示预测结果；失败时随真实 state
//   回退。updateFn 必须是纯函数。
// - <form action={fn}>：提交时调用函数；成功后非受控字段会自动重置。
//
// 【另外几个常问变化】
//
// - 函数组件可直接接收 ref prop；新代码通常不再需要 forwardRef，旧代码仍可工作。
// - <Context value={x}> 可直接作为 Provider；<Context.Provider> 仍用于旧版本兼容。
// - ref 回调可以返回清理函数。
// - createRoot/hydrateRoot 支持 onCaughtError、onUncaughtError、onRecoverableError，
//   用于根级错误上报；它们不替代组件树内用于降级 UI 的 Error Boundary。

// ============================================================================
// 六、一分钟面试答案
// ============================================================================

const interviewChecklist = [
  "并发渲染仍在主线程；render 可中断/重做，commit 同步",
  "useTransition 标记非紧急 state 更新；受控输入本身不能延迟",
  "useDeferredValue 延后非关键子树，不等于 debounce，也不减少请求",
  "Suspense 由 reconciler 处理挂起；Effect 内普通 fetch 不会触发它",
  "React 19 可用 use(stablePromise) 读取异步值，拒绝交给 Error Boundary",
  "hydrateRoot 要求首个客户端输出与服务端 HTML 一致",
  "SSR 产 HTML；RSC 在服务端求值组件，两者可以叠加",
  "React 19 表单重点：Action、useActionState、useFormStatus、useOptimistic",
];

if (require.main === module) {
  console.log("=== React 18 / 19 进阶面试清单 ===\n");
  interviewChecklist.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
}

module.exports = { interviewChecklist };
