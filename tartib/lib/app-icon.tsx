import { ImageResponse } from "next/og";

// Иконка приложения: знак Tartib на всю площадь (платформа сама скругляет углы)
const SRC = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMmRkNGJmIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMGY5ZDhkIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSJ1cmwoI2cpIi8+PHJlY3QgeD0iMTciIHk9IjE4IiB3aWR0aD0iMzAiIGhlaWdodD0iOSIgcng9IjMuNSIgZmlsbD0iIzA2MjAxYyIvPjxyZWN0IHg9IjI3IiB5PSIxOCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjI5IiByeD0iMy41IiBmaWxsPSIjMDYyMDFjIi8+PHBhdGggZD0iTTQwIDQxbDQuNSA0LjVMNTIgMzYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzA2MjAxYyIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=";

export function appIcon(size: number) {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={SRC} width={size} height={size} alt="" />
    ),
    { width: size, height: size },
  );
}
