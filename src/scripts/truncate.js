const MARKED = "truncatable";

function markTruncatable(elements, axis) {
  const horizontal = axis === "x";
  elements.forEach((el) => {
    const overflowing = horizontal
      ? el.scrollWidth > el.clientWidth
      : el.scrollHeight > el.clientHeight;
    el.classList.toggle(MARKED, overflowing);
  });
}

function initTruncatable(selector, axis) {
  const elements = Array.from(document.querySelectorAll(selector));
  if (elements.length === 0) return;

  markTruncatable(elements, axis);

  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => markTruncatable(elements, axis), 150);
  };

  window.addEventListener("resize", onResize);
  window.addEventListener("load", onResize);
}

export { initTruncatable, markTruncatable };
