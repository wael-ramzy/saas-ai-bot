-- ═══════════════════════════════════════════════════════════════
-- SUPABASE RPC FUNCTIONS — دوال البحث المدعومة من pgvector
-- ═══════════════════════════════════════════════════════════════
-- هذه الدوال تُنشأ مرة واحدة في Supabase SQL Editor
-- أو تلقائياً عبر psql

-- ─────────────────────────────────────────────
-- 1. دالة البحث المتجهي (Cosine Similarity)
-- تبحث عن أقرب النصوص لرسالة الزبون
-- ─────────────────────────────────────────────
create or replace function match_embeddings (
    query_embedding vector(1536),
    match_client_id uuid,
    match_count int default 5,
    min_similarity float default 0.35
)
returns table (
    item_id uuid,
    content_text text,
    content_type text,
    similarity float
)
language plpgsql
as $$
begin
    return query
    select
        e.item_id,
        e.content_text,
        e.content_type,
        1 - (e.embedding <=> query_embedding) as similarity
    from embeddings_store e
    where e.client_id = match_client_id
      and 1 - (e.embedding <=> query_embedding) > min_similarity
    order by e.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- ─────────────────────────────────────────────
-- 2. دالة البحث النصي السريع (Full-Text Search)
-- ─────────────────────────────────────────────
create or replace function match_menu_items_text (
    match_client_id uuid,
    search_query text,
    match_count int default 5
)
returns table (
    item_id uuid,
    item_name text,
    item_text text,
    category text,
    price numeric
)
language plpgsql
as $$
begin
    return query
    select
        m.item_id,
        m.item_name,
        m.item_text,
        m.category,
        m.price
    from menu_items m
    where m.client_id = match_client_id
      and m.is_available = true
      and (
          m.item_name ilike '%' || search_query || '%'
          or m.item_text ilike '%' || search_query || '%'
          or m.category ilike '%' || search_query || '%'
      )
    order by m.item_name
    limit match_count;
end;
$$;
