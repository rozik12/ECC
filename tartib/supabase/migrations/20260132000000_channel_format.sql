-- Оформление постов канала: заголовки, разделитель между языками, кнопка со ссылкой, хэштеги.
-- Тексты постов 15–30 добавлены в таблицу channel_posts отдельно (в базе), здесь только функции.
create or replace function public.channel_render(p_body text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  parts text[];
  e text[];
  i integer;
  txt text;
begin
  parts := string_to_array(p_body, E'\n\n');
  if array_length(parts, 1) <> 6 then
    return jsonb_build_object('text', replace(replace(replace(p_body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), 'url', null);
  end if;
  e := parts;
  for i in 1..6 loop
    e[i] := replace(replace(replace(parts[i], '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  end loop;
  txt := '<b>' || e[1] || '</b>' || E'\n\n' || e[2] || E'\n\n' || '▫️▫️▫️' || E'\n\n' || '<b>' || e[3] || '</b>' || E'\n\n' || e[4] || E'\n\n' || '<i>' || e[6] || '</i>' || E'\n\n' || '#Tartib #trading #intizom';
  return jsonb_build_object('text', txt, 'url', parts[5]);
end $$;
revoke all on function public.channel_render(text) from public, anon, authenticated;

create or replace function public.send_channel_post() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  token text;
  chan text;
  post public.channel_posts;
  r jsonb;
  b jsonb;
  req bigint;
begin
  select value into token from public.bot_config where key = 'telegram_token';
  select value into chan from public.bot_config where key = 'channel_id';
  if token is null or chan is null then return 'skip: no channel_id'; end if;
  select * into post from public.channel_posts where sent_at is null order by id limit 1;
  if post.id is null then return 'skip: queue empty'; end if;
  r := public.channel_render(post.body);
  b := jsonb_build_object('chat_id', chan, 'text', r->>'text', 'parse_mode', 'HTML', 'disable_web_page_preview', false);
  if (r->>'url') is not null and (r->>'url') like 'https://tartib.uk%' then
    b := b || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(jsonb_build_object('text', 'Открыть · Ochish', 'url', r->>'url')))));
  end if;
  select net.http_post(url := 'https://api.telegram.org/bot' || token || '/sendMessage', headers := jsonb_build_object('Content-Type', 'application/json'), body := b) into req;
  update public.channel_posts set sent_at = now(), request_id = req where id = post.id;
  return 'sent ' || post.id;
end $$;
revoke all on function public.send_channel_post() from public, anon, authenticated;
