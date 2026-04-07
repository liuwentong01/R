/**
 * React 核心高频题笔记（P0 / P1）
 *
 * 这是 React 目录的补充文件，专门收录“面试最常问、但当前目录里还没集中总结”的题目。
 * 现有目录更偏手写实现，本文件更偏高频问答和原理速记。
 *
 * 建议搭配阅读：
 *   - miniReact.js / miniReact3.js：更新调度、Fiber、diff
 *   - mini-hooks.js / mini-hooks-custom.js：Hooks 机制、闭包陷阱
 *   - mini-react-memo.js：memo / useMemo / useCallback
 *   - mini-synthetic-event.js：事件系统、批量更新
 *
 * 目录：
 *   1. setState / useState 为什么看起来“异步”
 *   2. React 18 自动批量更新（automatic batching）
 *   3. key 的作用，为什么不要滥用 index
 *   4. render 阶段 vs commit 阶段
 *   5. useEffect vs useLayoutEffect
 *   6. 受控组件 vs 非受控组件
 *   7. ref / forwardRef / useImperativeHandle
 *   8. 生命周期和 Hooks 的对应关系
 *   9. Context 为什么容易引发性能问题
 *   10. HOC / Render Props / 自定义 Hook 的演进
 *
 * 运行方式：node React/react-core-notes.js
 */

// ═══════════════════════════════════════════════════════════════════════════
// 一、setState / useState 为什么看起来“异步”
// ═══════════════════════════════════════════════════════════════════════════
//
// 【先说结论】
//   setState / setCount 不是 Promise 异步，也不是 setTimeout 异步。
//   它的本质是：把更新放进更新队列，等 React 调度下一次渲染时统一处理。
//
// 【为什么你在同一个函数里拿到的还是旧值？】
//   因为函数组件每次 render 都会形成一个“快照”：
//
//   function Counter() {
//     const [count, setCount] = useState(0);
//
//     function handleClick() {
//       setCount(count + 1);
//       console.log(count); // 这里还是旧值
//     }
//   }
//
//   这里的 count 是“本次 render 的快照值”，不会因为 setCount 立刻变成新值。
//   setCount 做的是“预约下一次 render 使用新值”。
//
// 【为什么连续 setCount(count + 1) 三次只加 1？】
//   因为三次都捕获了同一个旧 count：
//
//   setCount(count + 1);
//   setCount(count + 1);
//   setCount(count + 1);
//
//   等价于：
//   setCount(1);
//   setCount(1);
//   setCount(1);
//
//   最终结果当然是 1。
//
// 【正确写法：函数式更新】
//
//   setCount(c => c + 1);
//   setCount(c => c + 1);
//   setCount(c => c + 1);
//
//   这样 React 在处理队列时会把前一次计算结果传给下一次，所以最终是 3。
//
// 【面试常见问法】
//   Q: setState 是同步还是异步？
//   A: 都不是严格意义上的“同步/异步 API”问题，本质是“调度 + 批量更新”。
//      在当前执行栈里通常读到旧值，但 React 可能在稍后统一完成一次提交。


// ═══════════════════════════════════════════════════════════════════════════
// 二、React 18 自动批量更新（automatic batching）
// ═══════════════════════════════════════════════════════════════════════════
//
// 【React 17 及以前】
//   只有 React 事件回调中的更新会自动批量处理。
//   Promise / setTimeout / 原生事件中的更新，很多时候不会自动合并。
//
// 【React 18】
//   默认更激进：Promise、setTimeout、原生事件、async/await 后面的更新，
//   也会被自动批量处理。
//
//   Promise.resolve().then(() => {
//     setA(1);
//     setB(2);
//   });
//
//   React 18 通常只触发一次重新渲染。
//
// 【为什么要批量更新？】
//   因为一次事件里用户只关心最终 UI，不关心中间态。
//   合并后可以减少 render/commit 次数，提高性能。
//
// 【什么时候不想等批量？】
//   比如你刚 setState，马上就要读最新 DOM 布局，可以用 flushSync：
//
//   flushSync(() => setOpen(true));
//   // 此时 DOM 已提交，可以立刻测量
//
// 【面试常见问法】
//   Q: React 18 的 automatic batching 有什么变化？
//   A: 批量更新的范围扩大了，不再只限于 React 合成事件。
//
//   Q: flushSync 是干什么的？
//   A: 强制 React 立即提交更新，通常用于“更新后立刻读 DOM”的场景。


// ═══════════════════════════════════════════════════════════════════════════
// 三、key 的作用，为什么不要滥用 index
// ═══════════════════════════════════════════════════════════════════════════
//
// 【key 的本质】
//   key 不是给开发者“消除 warning”用的，它是给 React diff 用来识别节点身份的。
//
// 【React 怎么判断两个节点是不是“同一个”】
//   主要看两个条件：
//   1. type 是否相同
//   2. key 是否相同
//
//   type + key 相同：
//     复用旧 Fiber / 旧 DOM / 旧 state
//
//   type 相同但 key 不同：
//     视为卸载旧节点 + 挂载新节点
//
// 【为什么列表不建议直接用 index？】
//   当列表发生“插入 / 删除 / 排序”时，index 会整体漂移：
//
//   旧：A(0) B(1) C(2)
//   新：X(0) A(1) B(2) C(3)
//
//   React 会误以为：
//   - X 复用了原来 A 的节点
//   - A 复用了原来 B 的节点
//   - B 复用了原来 C 的节点
//
//   于是就可能出现：
//   - input 输入框的值串位
//   - 列表项内部 state 错位
//   - 动画和过渡异常
//
// 【什么时候用 index 还算安全？】
//   同时满足下面条件时通常可以接受：
//   1. 列表是静态的
//   2. 不会重排
//   3. 不会插入/删除中间项
//   4. 子项没有本地 state
//
// 【面试常见问法】
//   Q: key 改了会发生什么？
//   A: React 会把它当成一个全新的组件，旧组件卸载，新组件重新挂载，state 会丢失。
//
//   Q: key 只在列表里有用吗？
//   A: 不只。任何你想“显式重建组件”的地方都可以故意改 key。


// ═══════════════════════════════════════════════════════════════════════════
// 四、render 阶段 vs commit 阶段
// ═══════════════════════════════════════════════════════════════════════════
//
// 【render 阶段做什么？】
//   - 执行函数组件 / class render
//   - 计算新 Fiber 树
//   - 对比新旧节点，打 flags
//   - 收集副作用（Placement / Update / Deletion / Passive）
//
// 【commit 阶段做什么？】
//   - 真正操作 DOM
//   - 调 ref
//   - 执行 layout effects
//   - 浏览器绘制后执行 passive effects（useEffect）
//
// 【重要区别】
//   render 阶段：
//   - 必须纯
//   - 可能被中断、重试、丢弃
//   - 不能写副作用
//
//   commit 阶段：
//   - 一旦开始就会同步执行到底
//   - 真正影响页面
//   - 可以做 DOM 读写和副作用
//
// 【为什么 React 一直强调 render 要纯？】
//   因为并发模式下 render 可以：
//   - 渲染一半被打断
//   - 重新开始
//   - 结果被放弃
//
//   如果你在 render 里发请求、改全局变量、改 DOM，就会产生重复副作用。
//
// 【StrictMode 为什么会“执行两次”？】
//   开发环境下，React 会故意多跑一轮 render / effect 清理与重建，
//   用来帮助你发现“不纯渲染”和不正确的副作用写法。
//
// 【面试常见问法】
//   Q: useEffect 属于 render 还是 commit？
//   A: 属于 commit 后的 passive effect，不在 render 里执行。


// ═══════════════════════════════════════════════════════════════════════════
// 五、useEffect vs useLayoutEffect
// ═══════════════════════════════════════════════════════════════════════════
//
// 【共同点】
//   两者都会在 commit 阶段相关时机执行，都可以返回 cleanup。
//
// 【核心区别：时机】
//   useLayoutEffect：
//     DOM 提交后、浏览器绘制前同步执行
//
//   useEffect：
//     浏览器绘制后异步执行（更准确地说：作为 passive effect 延后执行）
//
// 【什么时候用 useLayoutEffect？】
//   需要“读布局并立刻修正”的场景：
//   - 测量元素尺寸
//   - 计算滚动位置
//   - 避免闪烁（先测量再定位）
//
// 【什么时候优先用 useEffect？】
//   大多数副作用都应该先考虑 useEffect：
//   - 发请求
//   - 订阅事件
//   - 记录日志
//   - 启动定时器
//
// 【为什么不能滥用 useLayoutEffect？】
//   因为它会阻塞浏览器绘制，使用过多会影响首屏和交互流畅度。
//
// 【面试常见问法】
//   Q: 为什么有时候 useEffect 会导致页面“闪一下”？
//   A: 因为浏览器已经先绘制了一次，effect 才去改位置/样式。
//      这类“绘制前必须修正”的逻辑更适合 useLayoutEffect。


// ═══════════════════════════════════════════════════════════════════════════
// 六、受控组件 vs 非受控组件
// ═══════════════════════════════════════════════════════════════════════════
//
// 【受控组件（controlled）】
//   表单值由 React state 驱动：
//
//   <input value={value} onChange={e => setValue(e.target.value)} />
//
//   数据流：
//   用户输入 → onChange → setState → 重新 render → value 回填 DOM
//
// 【优点】
//   - 单一数据源，状态可预测
//   - 方便校验、联动、格式化、禁用提交
//   - 便于和业务状态管理统一
//
// 【缺点】
//   - 每次输入都要走一次 React 更新
//   - 大表单写起来更繁琐
//
// 【非受控组件（uncontrolled）】
//   DOM 自己保存当前值，React 只在需要时通过 ref 读取：
//
//   <input defaultValue="Tom" ref={inputRef} />
//
//   提交时：
//   inputRef.current.value
//
// 【适用场景】
//   - 简单表单
//   - 文件上传（file input 天然偏非受控）
//   - 需要兼容第三方非 React 表单库
//
// 【面试常见问法】
//   Q: 业务开发中更推荐哪种？
//   A: 大多数复杂业务表单更推荐受控组件，因为它更好做校验、回显和联动。


// ═══════════════════════════════════════════════════════════════════════════
// 七、ref / forwardRef / useImperativeHandle
// ═══════════════════════════════════════════════════════════════════════════
//
// 【ref 是干什么的？】
//   ref 用于“拿到组件外部的可变引用”，常见用途：
//   - 拿 DOM 节点
//   - 调 focus / scrollIntoView
//   - 保存定时器 ID
//   - 保存最新值，规避闭包陷阱
//
// 【为什么函数组件默认不能直接挂 ref？】
//   因为函数组件没有实例，ref 默认只能挂到 DOM 或 class 实例上。
//
// 【forwardRef 的作用】
//   让父组件传入的 ref，能够继续转发到子组件内部的某个 DOM 或对象上。
//
//   const Input = forwardRef((props, ref) => {
//     return <input ref={ref} />;
//   });
//
// 【useImperativeHandle 的作用】
//   不把整个 DOM 暴露给父组件，而是只暴露有限的命令式 API：
//
//   useImperativeHandle(ref, () => ({
//     focus() {
//       inputRef.current.focus();
//     }
//   }));
//
// 【为什么它重要？】
//   这样可以把“内部实现细节”封装起来，只暴露必要能力。
//   是命令式能力和声明式封装之间的平衡。
//
// 【面试常见问法】
//   Q: forwardRef 和 useImperativeHandle 一般一起用在什么场景？
//   A: 输入框 focus、弹窗 open/close、滚动定位、表单触发 submit 等。


// ═══════════════════════════════════════════════════════════════════════════
// 八、生命周期和 Hooks 的对应关系
// ═══════════════════════════════════════════════════════════════════════════
//
// 【Class 时代常问】
//   - componentDidMount
//   - componentDidUpdate
//   - componentWillUnmount
//
// 【Hooks 时代怎么理解？】
//   不要机械地说“useEffect = 三个生命周期的组合”，更准确一点：
//
//   useEffect(() => {
//     // mount + update 后执行
//     return () => {
//       // 下次 effect 前清理，或 unmount 时清理
//     };
//   }, deps);
//
// 【对应关系】
//   useEffect(fn, [])：
//     接近 componentDidMount + componentWillUnmount
//     但注意开发环境 StrictMode 下可能会多跑一轮校验
//
//   useEffect(fn, [a, b])：
//     接近“依赖变化后的 didUpdate”
//
//   useEffect(fn)：
//     每次提交后都执行
//
// 【为什么 Hooks 没有完全等价的生命周期表？】
//   因为 Hooks 的思维不是“组件处于哪个阶段”，而是“某个副作用依赖什么数据”。
//
// 【面试常见问法】
//   Q: 有对应 componentDidCatch 的 Hook 吗？
//   A: 没有。错误边界目前仍然依赖 Class 组件能力。


// ═══════════════════════════════════════════════════════════════════════════
// 九、Context 为什么容易引发性能问题
// ═══════════════════════════════════════════════════════════════════════════
//
// 【误区】
//   很多人以为 Context = 状态管理库，但它本质上只是“跨层传值”。
//
// 【性能问题怎么来的？】
//   当 Provider 的 value 引用变化时，所有消费该 Context 的后代都会重新参与更新。
//
//   <MyContext.Provider value={{ theme, toggleTheme }}>
//     ...
//   </MyContext.Provider>
//
//   如果每次 render 都创建新对象：
//   value={{ theme, toggleTheme }}
//
//   那么即使 theme 没变，value 引用也变了，消费者可能都要重新渲染。
//
// 【常见优化】
//   1. useMemo 稳定 Provider value 引用
//   2. 拆分多个 Context，减少无关更新扩散
//   3. 频繁变化的大状态不要一股脑全塞进一个 Context
//   4. 真正复杂场景考虑 selector 化方案或外部状态库
//
// 【什么时候 Context 很合适？】
//   - 主题 theme
//   - 当前语言 locale
//   - 登录态中的少量稳定信息
//   - 表单/组件库内部的共享配置
//
// 【面试常见问法】
//   Q: Context 能完全替代 Redux/Zustand 吗？
//   A: 不能简单等价。Context 负责“传递”，状态库通常还负责“选择订阅、更新隔离、调试工具”等。


// ═══════════════════════════════════════════════════════════════════════════
// 十、HOC / Render Props / 自定义 Hook 的演进
// ═══════════════════════════════════════════════════════════════════════════
//
// 【1. HOC（高阶组件）】
//   本质：输入组件，输出增强后的新组件。
//
//   withAuth(UserPage) -> ProtectedUserPage
//
//   优点：
//   - 复用逻辑清晰
//   - 包装能力强
//
//   缺点：
//   - 容易出现“组件嵌套地狱”
//   - props 命名冲突
//   - 调试时组件层级不直观
//
// 【2. Render Props】
//   本质：把“如何渲染”作为函数传进去。
//
//   <Mouse>{({ x, y }) => <div>{x}, {y}</div>}</Mouse>
//
//   优点：
//   - 复用逻辑灵活
//   - 避免部分 HOC 命名冲突
//
//   缺点：
//   - JSX 嵌套深
//   - 每次 render 都会创建新函数
//
// 【3. 自定义 Hook】
//   本质：把状态逻辑提炼成 useXxx 函数。
//
//   const { loading, data } = useRequest(...)
//
//   优点：
//   - 逻辑复用最自然
//   - 组合能力强
//   - 更贴合函数组件
//
//   限制：
//   - 只能在 Hook 规则允许的位置调用
//   - 不能直接用于 class 组件
//
// 【面试常见问法】
//   Q: 现在为什么大家更推崇自定义 Hook？
//   A: 因为它能在不改组件树结构的前提下复用状态逻辑，组合更自然，可读性也更好。


console.log("=== React 核心高频题笔记（P0 / P1）===\n");
console.log("本文件只包含注释，不包含代码实现。\n");

const topics = [
  {
    name: "setState / useState 为什么看起来异步",
    key: "更新进入队列，当前 render 读到的是快照；函数式更新可避免旧值问题",
  },
  {
    name: "React 18 自动批量更新",
    key: "Promise / setTimeout / 原生事件里的多个更新也会自动合并；必要时可用 flushSync",
  },
  {
    name: "key 的作用",
    key: "type + key 决定节点身份；key 变了就重建；乱用 index 会导致状态错位",
  },
  {
    name: "render vs commit",
    key: "render 负责计算且必须纯；commit 负责真实 DOM 提交和副作用执行",
  },
  {
    name: "useEffect vs useLayoutEffect",
    key: "一个在绘制后，一个在绘制前；测量布局和防闪烁更适合 layout effect",
  },
  {
    name: "受控 vs 非受控",
    key: "受控更适合复杂业务表单；非受控更轻但可控性弱",
  },
  {
    name: "ref / forwardRef / useImperativeHandle",
    key: "用于暴露命令式能力，但应尽量只暴露必要 API",
  },
  {
    name: "生命周期和 Hooks",
    key: "Hooks 更强调副作用依赖，而不是机械映射生命周期阶段",
  },
  {
    name: "Context 性能问题",
    key: "Provider value 引用变化会扩散更新；常见优化是拆分 Context 和 memo value",
  },
  {
    name: "HOC / Render Props / 自定义 Hook",
    key: "React 逻辑复用模式的演进，自定义 Hook 是当前最主流方案",
  },
];

topics.forEach((topic, index) => {
  console.log(`  ${index + 1}. ${topic.name}`);
  console.log(`     核心: ${topic.key}\n`);
});

console.log("\n=== 面试要点总览 ===");
console.log("1. 不要把 setState 理解成“异步函数”，它更准确是“入队并等待调度”");
console.log("2. 连续依赖旧值更新时，用函数式更新，不要直接写 setCount(count + 1)");
console.log("3. React 18 扩大了自动批量更新范围，必要时可用 flushSync 打破批量");
console.log("4. key 的核心是节点身份，不只是消除 warning；错误 key 会导致 state 串位");
console.log("5. render 阶段必须保持纯函数思维，真正的 DOM 和副作用发生在 commit");
console.log("6. 大多数副作用优先用 useEffect，只有布局测量/防闪烁才考虑 useLayoutEffect");
console.log("7. 复杂业务表单优先受控组件；文件上传等场景常用非受控");
console.log("8. ref 是命令式逃生舱，forwardRef + useImperativeHandle 用于精确暴露能力");
console.log("9. Context 解决的是跨层传值，不等于高性能状态管理");
console.log("10. 逻辑复用模式从 HOC / Render Props 演进到自定义 Hook，Hook 是当前主流");
