function quickSort(arr) {
  // 只排序 arr 中下标 left 到 right 的部分
  function sort(left, right) {
    // 区间中没有元素或只有一个元素，不需要排序
    if (left >= right) return;

    let i = left; // 从左向右找“不该在左边”的数
    let j = right; // 从右向左找“不该在右边”的数

    // 取区间中间位置的值作为基准值
    // 注意：保存的是值，后续交换元素不会改变 pivot
    const pivot = arr[Math.floor((left + right) / 2)];

    // 将小于 pivot 的数移到左侧，大于 pivot 的数移到右侧
    while (i <= j) {
      // 左边的数小于基准值，位置正确，继续向右找
      while (arr[i] < pivot) i++;

      // 右边的数大于基准值，位置正确，继续向左找
      while (arr[j] > pivot) j--;

      // 此时 arr[i] 应放右边、arr[j] 应放左边，交换它们
      if (i <= j) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        i++;
        j--;
      }
    }

    // 分区结束后，左右两部分各自再排序
    if (left < j) sort(left, j);
    if (i < right) sort(i, right);
  }

  sort(0, arr.length - 1);
  return arr;
}

const nums = [5, 3, 8, 4, 2];
console.log(quickSort(nums)); // [2, 3, 4, 5, 8]
