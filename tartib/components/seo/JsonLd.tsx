/** Структурированные данные для поисковиков (schema.org). Пользователю не видны. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // "<" экранируется, чтобы текст внутри данных не мог закрыть тег script
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
