/**
 * Mini Router：URL 订阅、路径匹配与声明式导航
 *
 * 这是面试用教学实现，不是 React Router 的源码：只覆盖静态段、:param、末尾 *、
 * browser/hash history 和路由排名；不覆盖嵌套路由、相对路径、loader/action、阻塞器、
 * SSR、basename。生产项目应使用成熟路由库。
 *
 * 运行：node React/08-mini-router.js
 */

const assert = require("node:assert/strict");

// ----------------------------------------------------------------------------
// 1. URL 与 history：pushState 本身不会触发 popstate
// ----------------------------------------------------------------------------

function readBrowserLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    state: window.history.state,
  };
}

function createBrowserHistory() {
  const listeners = new Set();
  const onPopState = () => notify();

  function notify() {
    const location = readBrowserLocation();
    [...listeners].forEach((listener) => listener(location));
  }

  function listen(listener) {
    if (typeof listener !== "function") throw new TypeError("listener 必须是函数");
    if (listeners.size === 0) window.addEventListener("popstate", onPopState);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("popstate", onPopState);
    };
  }

  function push(to, state = null) {
    window.history.pushState(state, "", to);
    notify(); // pushState 不派发 popstate，所以应用主动通知
  }

  function replace(to, state = null) {
    window.history.replaceState(state, "", to);
    notify();
  }

  return {
    push,
    replace,
    listen,
    get location() {
      return readBrowserLocation();
    },
  };
}

function readHashLocation() {
  const raw = window.location.hash.slice(1) || "/";
  const queryIndex = raw.indexOf("?");
  return {
    pathname: queryIndex === -1 ? raw : raw.slice(0, queryIndex),
    search: queryIndex === -1 ? "" : raw.slice(queryIndex),
    hash: window.location.hash,
    state: window.history.state,
  };
}

function createHashHistory() {
  const listeners = new Set();
  const onHashChange = () => {
    const location = readHashLocation();
    [...listeners].forEach((listener) => listener(location));
  };

  function listen(listener) {
    if (typeof listener !== "function") throw new TypeError("listener 必须是函数");
    if (listeners.size === 0) window.addEventListener("hashchange", onHashChange);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("hashchange", onHashChange);
    };
  }

  function push(to) {
    window.location.hash = to.startsWith("#") ? to : `#${to}`;
    // location.hash 变化会派发 hashchange；不要再同步 notify，否则可能通知两次。
  }

  function replace(to, state = null) {
    const nextHash = to.startsWith("#") ? to : `#${to}`;
    const url = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(state, "", url);
    onHashChange(); // replaceState 不派发 hashchange
  }

  return {
    push,
    replace,
    listen,
    get location() {
      return readHashLocation();
    },
  };
}

// ----------------------------------------------------------------------------
// 2. 匹配：静态段 > 动态段 > 通配符
// ----------------------------------------------------------------------------

function splitPath(value) {
  const pathname = (value || "/").split(/[?#]/, 1)[0];
  return pathname.split("/").filter(Boolean);
}

function safelyDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 支持：/about、/users/:id、/files/*。返回 null 表示不匹配。
 * 默认 end=true（整条路径必须消费完）；父级嵌套路由通常会用 end=false。
 */
function matchPath(pattern, pathname, { end = true } = {}) {
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(pathname);
  const params = {};
  let pathIndex = 0;

  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];

    if (part === "*") {
      if (i !== patternParts.length - 1) {
        throw new Error("教学实现只支持末尾通配符 *");
      }
      params["*"] = safelyDecode(pathParts.slice(pathIndex).join("/"));
      pathIndex = pathParts.length;
      break;
    }

    const value = pathParts[pathIndex];
    if (value === undefined) return null;

    if (part.startsWith(":")) {
      const name = part.slice(1);
      if (!name) throw new Error("动态参数必须有名称");
      params[name] = safelyDecode(value);
    } else if (part !== value) {
      return null;
    }
    pathIndex++;
  }

  if (end && pathIndex !== pathParts.length) return null;

  return {
    params,
    pathname: `/${pathParts.slice(0, pathIndex).join("/")}`,
  };
}

function scorePath(pattern) {
  return splitPath(pattern).reduce((score, part) => {
    if (part === "*") return score - 2;
    if (part.startsWith(":")) return score + 3;
    return score + 10;
  }, splitPath(pattern).length);
}

/**
 * 真实 React Router v6/v7 会先对分支排名，而不是像 v5 <Switch> 那样只看声明顺序。
 */
function matchRoutes(routes, pathname) {
  const ranked = routes
    .map((route, index) => ({ route, index, score: scorePath(route.path) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const candidate of ranked) {
    const match = matchPath(candidate.route.path, pathname);
    if (match) return { route: candidate.route, ...match };
  }
  return null;
}

// ----------------------------------------------------------------------------
// 3. Link 为什么仍应渲染 <a>
// ----------------------------------------------------------------------------

function shouldHandleLinkClick(event, target) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!target || target === "_self")
  );
}

function createLinkClickHandler(history, to, { replace = false, target } = {}) {
  return function onClick(event) {
    if (!shouldHandleLinkClick(event, target)) return;
    event.preventDefault();
    history[replace ? "replace" : "push"](to);
  };
}

// 在 React 中，Router 会订阅 history，把 location 放进 Context，并在变化时 setState。
// useLocation/useNavigate 从 Context 读取；useParams 读取当前匹配分支；嵌套路由把匹配
// 结果逐层交给 <Outlet>。订阅必须在 Effect 中建立并返回 unsubscribe，不能在 render
// 中每次 listen，否则会泄漏。现代外部 store 订阅还要考虑 useSyncExternalStore 的一致性。
//
// Link 必须保留真实 href，才能支持可访问性、复制链接、新标签页与禁用 JS 的降级。
// 本模型只演示“同窗口普通左键”的修饰键/target 判断；生产实现还必须识别 download、
// 跨域 URL 等情况并交给浏览器，不能直接照搬这里的 click handler。
// Browser history 部署时服务器要把未知前端路径回退到入口 HTML；hash 模式不需要。

function runDemo() {
  assert.deepEqual(matchPath("/users/:id", "/users/a%20b"), {
    params: { id: "a b" },
    pathname: "/users/a%20b",
  });
  assert.deepEqual(matchPath("/files/*", "/files/a/b.txt").params, {
    "*": "a/b.txt",
  });
  assert.equal(matchPath("/users/:id", "/users/1/edit"), null);
  assert.ok(matchPath("/users", "/users/1", { end: false }));

  const routes = [
    { path: "*", element: "NotFound" },
    { path: "/users/:id", element: "User" },
    { path: "/users/new", element: "NewUser" },
  ];
  const result = matchRoutes(routes, "/users/new");
  assert.equal(result.route.element, "NewUser");

  console.log("Mini Router tests passed");
  console.log("重点：URL 订阅 + 分支排名 + params + Context + Link 导航");
}

if (require.main === module) runDemo();

module.exports = {
  createBrowserHistory,
  createHashHistory,
  matchPath,
  matchRoutes,
  createLinkClickHandler,
};
