// 方法一
let imgList = [...document.querySelectorAll("img")];

const imgLazyLoad = (function () {
  let count = 0;
  return function () {
    let deleteIndexList = [];
    imgList.forEach((img, index) => {
      let rect = img.getBoundingClientRect();
      if (rect.top < window.innerHeight) {
        img.src = img.dataset.src;
        deleteIndexList.push(index);
        count++;
        if (count === imgList.length) {
          document.removeEventListener("scroll", imgLazyLoad);
        }
      }
    });
    imgList = imgList.filter((img, index) => !deleteIndexList.includes(index));
  };
})();

// 这里最好加上防抖处理
document.addEventListener("scroll", imgLazyLoad);

// 方法二

<img src="/images/photo.jpg" loading="lazy" width="400" height="300" alt="照片"></img>;

// 方法三

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const img = entry.target;
      img.src = img.dataset.src;
      observer.unobserve(img);
    }
  },
  { rootMargin: "200px" }, // 提前 200px 开始加载
);

document.querySelectorAll("img[data-src]").forEach((img) => {
  observer.observe(img);
});
