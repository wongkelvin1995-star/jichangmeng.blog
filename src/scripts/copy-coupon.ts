// 优惠码复制：无 JavaScript 时按钮保持隐藏，优惠码文字仍可手动选中。
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy!);
      button.textContent = '已复制';
    } catch {
      button.textContent = '请手动复制';
    }
    setTimeout(() => {
      button.textContent = '复制';
    }, 1800);
  });
});
