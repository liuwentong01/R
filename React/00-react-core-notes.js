/**
 * React 核心面试笔记（P0 / P1）
 *
 * 运行：node React/00-react-core-notes.js
 *
 * 文件优先级：00-07 为核心高频，08-13 为常见进阶/生态题，14-17 为低频专项。
 * 数字越小越应优先掌握；同一知识点以靠前文件的结论为复习主线。
 *
 * 配套可运行文件：
 * - 01-mini-react-internals-demo.js：Fiber、render/commit、keyed diff、useState
 * - 02-mini-hooks.js / 12-mini-hooks-custom.js：Hook 队列、依赖、闭包与 cleanup
 * - 03-mini-batched-updates.js / 04-mini-layout-effect.js：批处理与 Effect 时序
 * - 07-mini-controlled-form.js / 13-mini-forward-ref.js：表单与 ref
 * - 11-mini-lazy-suspense.js：lazy 与 Suspense 状态机
 * - 06-react-advanced-notes.js：并发、SSR/RSC、React 19 Actions
 *
 * 本文件只保留通用高频结论；HOC、Render Props、旧生命周期细节不再展开。
 */

// ============================================================================
// 一、state 是快照，更新进入队列
// ============================================================================
//
// function Counter() {
//   const [count, setCount] = useState(0);
//   function handleClick() {
//     setCount(count + 1);
//     console.log(count); // 仍是本次 render 的快照
//   }
// }
//
// setState 不是“返回 Promise 的异步函数”。setter 把更新入队并请求下一次 render；
// 已经运行中的事件处理器闭包不会原地换成新 state。
//
// 连续依赖旧值时：
//
//   setCount(count + 1); // 三次都用同一个 count，通常最终只 +1
//   setCount(count + 1);
//   setCount(count + 1);
//
//   setCount(c => c + 1); // updater 串行消费前一个结果，最终 +3
//   setCount(c => c + 1);
//   setCount(c => c + 1);
//
// 高频边界：
// - useState setter 替换这一项 state；class this.setState({ ... }) 才浅合并对象。
// - setter/dispatch 引用稳定，可以省略出 Effect 依赖。
// - useState(() => expensiveInit()) 只在挂载初始化；开发 StrictMode 可能额外调用
//   initializer/updater 来检查纯度，所以二者都不能有副作用。
// - 新状态与旧状态 Object.is 相同时，React 通常可以跳过后续更新。

// ============================================================================
// 二、render 与 commit：为什么 render 必须纯
// ============================================================================
//
// Render phase：调用组件，读取 props/state/context，协调新旧树并生成 flags。
// Commit phase：同步提交 DOM mutation、ref 和 layout effect；passive effect 另行刷新。
//
// render 可能被暂停、重做或丢弃，不能在这里请求、订阅、改 DOM、改外部变量。
// 副作用优先放在事件处理器；只有“组件出现在屏幕上后必须与外部系统同步”的逻辑
// 才放 Effect。commit 一旦开始不会像并发 render 那样被中断。
//
// StrictMode 的精确回答：仅开发环境启用额外检查；组件中应保持纯的函数会额外调用。
// 根部 StrictMode 下，Effect 会经历额外 setup -> cleanup -> setup，callback ref 也会有
// 额外 setup/cleanup 周期。
// 不是“生产环境所有逻辑都会执行两次”，事件处理器也不会因此双击。

// ============================================================================
// 三、协调、key 与 state 身份
// ============================================================================
//
// React 用“父节点下的位置 + element type + key”判断身份：
// - 身份保持：复用 Fiber、DOM（适用时）和组件 state。
// - type/key 改变或从树中移除：旧组件卸载，新组件挂载，state 重置。
//
// key 只需在同一组兄弟中唯一，不会作为普通 prop 传给组件。稳定业务 id 最合适。
// index 只有在列表静态、不重排、不增删且没有位置相关本地 state 时才相对安全。
// 在头部插入、排序或删除时用 index，会让 state/非受控 input 跟着“位置”串项。
//
// 两个实用结论：
// - 故意改变 key 可以重置表单等子树状态。
// - 不要在另一个组件函数内部定义组件；每次 render 都产生新 type，容易反复卸载。

// ============================================================================
// 四、Hooks 规则、闭包与 Effect
// ============================================================================
//
// 普通 Hook 依靠稳定调用顺序对应 Fiber 上的 Hook 链表，因此只能在函数组件或
// 自定义 Hook 顶层调用，不能放在条件、循环、事件回调或普通函数里。
// （React 19 的 use 是特殊 API，可在条件/循环中使用，见进阶笔记。）
//
// 每次 render 都创建自己的闭包。旧定时器/订阅读取旧 state，并不是 React 没更新，
// 而是函数捕获了那次 render 的快照。解决方式必须按问题选择：
// - 更新依赖旧 state：函数式更新；
// - Effect 用到了 reactive value：把它列入依赖，并正确 cleanup；
// - 长期回调只需读取最新值且不触发 render：谨慎使用 ref；
// - 不要随意用空依赖或关闭 eslint exhaustive-deps 来“修复”重复执行。
// React 19.2+ 的 useEffectEvent 可把 Effect 内真正“非响应式”的事件逻辑拆出，并读取
// 最新已提交值；它只能从 Effect/Effect Event 调用，不能用来逃避本应声明的依赖。
//
// useEffect(() => {
//   const connection = connect(roomId);
//   return () => connection.disconnect();
// }, [roomId]);
//
// 时序：挂载执行 setup；依赖变化时先用旧闭包 cleanup，再用新闭包 setup；卸载 cleanup。
// 依赖逐项 Object.is 比较。不传依赖数组：每次提交后；[]：挂载周期（StrictMode 开发
// 检查除外）；[a, b]：a/b 变化时。
//
// useLayoutEffect：DOM 已提交、浏览器重绘前同步运行，适合测量后立即修正布局，会阻塞绘制。
// useEffect：passive effect，不阻塞绘制，适合网络连接、订阅、定时器等。通常在绘制后，
// 但不能把“必定在 paint 后”当契约；交互或 layout effect 的同步更新可能使它更早刷新。

// ============================================================================
// 五、你可能不需要 Effect：state 设计与不可变更新
// ============================================================================
//
// 能在 render 中由 props/state 算出的值不要再存一份 state，也不要 Effect 后 setState：
//
//   const fullName = `${firstName} ${lastName}`; // 不要另存 fullName state
//
// 用户动作引发的业务操作放事件处理器；Effect 用于“因组件已渲染而与外部系统同步”。
// 多存一份派生 state 会造成额外 render 和数据不同步。
//
// state/props 按不可变值处理：创建新对象/数组，而不是原地 push、赋值后传回同一引用。
// 原因不只是编码风格：state bailout、React.memo、Hook deps 等都依赖引用比较，而且旧
// render 的快照必须保持可信。嵌套更新要复制从根到修改点沿途的每一层。

// ============================================================================
// 六、React 18 automatic batching
// ============================================================================
//
// React 18 使用 createRoot 时，同一批 React 事件、Promise、setTimeout、原生事件等来源
// 的更新都可自动批处理，减少 render/commit。React 18 旧 ReactDOM.render 保留旧行为。
// 批处理不会改变快照语义，也不是把跨任意时间的更新永远合并；不同用户事件仍分别处理。
//
// 必须在更新后立刻读取 DOM 的第三方集成场景，可从 react-dom 使用 flushSync：
//
//   flushSync(() => setOpen(true));
//   measure();
//
// flushSync 可能连带刷新其他挂起工作、Effect 或 Suspense fallback，并损害性能，只作逃生舱。

// ============================================================================
// 七、React.memo / useMemo / useCallback
// ============================================================================
//
// - React.memo(Component)：父组件 render 时，若 props 逐项浅比较未变，可跳过子组件 render。
// - useMemo(factory, deps)：缓存 factory 的计算结果。
// - useCallback(fn, deps)：缓存函数引用，近似 useMemo(() => fn, deps)。
//
// 它们都是性能优化，不是语义保证。组件自己的 state 或所消费 Context 变化时，memo 后
// 仍会更新。给普通廉价计算到处加 memo 会增加依赖维护和比较成本。
//
// useCallback 只有在“引用稳定”能被下游利用时才通常有价值，例如传给 memo 子组件，
// 或作为另一个 Hook 的依赖。传入每次新建的对象/函数会让 memo 很快失效；优先先让组件
// 保持纯、state 就近、减少不必要 Effect，再用 Profiler/测量定位热点。
//
// 现代补充：React Compiler 1.0 是可选的构建期工具，可自动 memoize 组件和 render 中的值。
// 启用 Compiler 的新代码通常减少手写 memo；它要求代码遵守 Rules of React，并不会让
// 不纯组件变正确。既有手工 memo 不要未经测试就批量删除。

// ============================================================================
// 八、Context：跨层传值，不等于完整状态管理
// ============================================================================
//
// Provider value 按 Object.is 判断是否改变；改变后，读取该 Context 的消费者会参与更新，
// React.memo 不能挡住消费者接收到的新 Context。defaultValue 只在上方没有匹配 Provider
// 时使用；Provider 明确传 undefined，消费者得到的就是 undefined。
//
// 常见优化：
// - 把更新频率不同的数据拆成多个 Context；
// - 避免无意义地每次创建 value={{ ... }}，必要时稳定对象和回调；
// - state 下沉到真正使用它的局部；大规模高频状态考虑 selector/外部 store。
//
// Context 负责传递；状态库通常还提供细粒度订阅、selector、中间件和调试能力。

// ============================================================================
// 九、受控/非受控组件
// ============================================================================
//
// 受控 input：value/checked 来自 React state，并由 onChange 同步更新，适合校验和联动。
// 非受控 input：DOM 保存当前值，React 用 defaultValue/defaultChecked 初始化并通过 ref 读取。
// file input 的值不能由 React 脚本设定，通常按非受控处理。
//
// 一个 input 生命周期内不要在受控与非受控间切换。传 value 却不给 onChange（且非 readOnly）
// 会变成不可编辑；受控文本值不要从 undefined/null 突然切为字符串。

// ============================================================================
// 十、ref 与命令式逃生舱（React 18/19 版本边界）
// ============================================================================
//
// ref 跨 render 保持可变容器；修改 current 不触发 render。用于 focus、滚动、测量、定时器
// ID 等不参与渲染的数据。不要在 render 中读写 DOM ref；DOM 在 commit 后才可靠。
//
// React 18 及更早，函数组件通常通过 forwardRef 接收父 ref。React 19 起函数组件可直接把
// ref 当 prop 接收，新代码不再需要 forwardRef；官方计划在未来版本弃用 forwardRef，
// 但旧代码仍可使用。useImperativeHandle 用于只暴露 focus 等有限 API，而非整个 DOM。
// 能用 props 表达的声明式状态（如 isOpen）优先用 props，不要滥用 open()/close() ref API。

// ============================================================================
// 十一、Error Boundary 高频边界
// ============================================================================
//
// Error Boundary 捕获后代在 render 和生命周期中的错误并显示降级 UI；传统实现仍依赖
// class 的 getDerivedStateFromError/componentDidCatch。它不捕获事件处理器、普通异步回调、
// 服务端渲染错误或边界自身错误。Suspense 负责“等待”，Error Boundary 负责“失败”。
// Suspense 的完整可运行状态机见 11-mini-lazy-suspense.js。

const interviewChecklist = [
  "state 是 render 快照；setter 入队，依赖旧值用函数式更新",
  "render 可重做且必须纯；commit 才真正修改 DOM 并运行提交期逻辑",
  "组件 state 的身份由父级位置、type、key 共同决定",
  "Effect 用来同步外部系统；依赖完整，变化/卸载时 cleanup",
  "可派生的数据直接在 render 计算；对象和数组做不可变更新",
  "React 18 + createRoot 扩大自动批处理；flushSync 只作逃生舱",
  "memo/useMemo/useCallback 是性能优化，不保证业务语义",
  "Context value 变化会通知消费者；React.memo 不能屏蔽新 Context",
  "受控表单由 state 驱动；不要在受控/非受控间切换",
  "React 19 可直接接收 ref prop；旧版使用 forwardRef",
  "Suspense 处理等待，Error Boundary 处理渲染失败",
];

if (require.main === module) {
  console.log("=== React 核心面试清单 ===\n");
  interviewChecklist.forEach((item, index) => console.log(`${index + 1}. ${item}`));
}

module.exports = { interviewChecklist };
