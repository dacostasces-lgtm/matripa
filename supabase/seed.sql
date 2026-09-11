-- Jeu de démonstration : profils publiés sur Matripa.
-- Rejouable : `on conflict (slug) do update` remet les lignes à leur état seed.

do $$
begin

insert into public.listings (
  slug, title, highlight, description, category, option_type, mobility,
  city, district, price_xaf, price_unit, rates, cover_url, images,
  rating, reviews_count, is_vip, is_verified, languages, availability, status
) values

-- ── Rencontres ───────────────────────────────────────────────────────────
('mireille-23-brazzaville', 'Mireille, 23 ans', 'Sorties & soirées',
 E'Profil vérifié à Brazzaville. Mireille privilégie les échanges respectueux et les rendez-vous organisés en toute discrétion.',
 'categorie-a', 'option_1', 'sur_place', 'brazzaville', 'Bacongo', 25000, 'hour',
 '[{"label":"Rendez-vous","amount_xaf":25000,"unit":"hour"}]',
 '/profiles/mireille.png',
 array['/profiles/mireille.png'],
 null, 0, true, true, array['Français','Lingala'], array['Sur rendez-vous'], 'published'),

-- ── Massages ─────────────────────────────────────────────────────────────
('sonia-25-pointe-noire', 'Sonia, 25 ans', 'Massages sensuels & relaxation',
 E'Profil vérifié à Pointe-Noire. Sonia propose des moments de détente dans un cadre serein et respectueux.',
 'categorie-b', 'option_2', 'sur_place', 'pointe-noire', 'Centre-ville', 35000, 'hour',
 '[{"label":"Séance","amount_xaf":35000,"unit":"hour"}]',
 '/profiles/sonia.png',
 array['/profiles/sonia.png'],
 null, 0, true, true, array['Français'], array['Sur rendez-vous'], 'published'),

-- ── Escortes ─────────────────────────────────────────────────────────────
('grace-22-brazzaville', 'Grace, 22 ans', 'Accompagnement VIP',
 E'Profil vérifié à Brazzaville. Grace propose un accompagnement discret pour vos sorties et soirées.',
 'categorie-c', 'option_3', 'les_deux', 'brazzaville', 'Centre-ville', 50000, 'hour',
 '[{"label":"Accompagnement","amount_xaf":50000,"unit":"hour"}]',
 '/profiles/grace.png',
 array['/profiles/grace.png'],
 null, 0, false, true, array['Français','Anglais'], array['Sur rendez-vous'], 'published')

on conflict (slug) do update set
  title = excluded.title, highlight = excluded.highlight, description = excluded.description,
  category = excluded.category, option_type = excluded.option_type, mobility = excluded.mobility,
  city = excluded.city, district = excluded.district,
  price_xaf = excluded.price_xaf, price_unit = excluded.price_unit, rates = excluded.rates,
  cover_url = excluded.cover_url, images = excluded.images,
  rating = excluded.rating, reviews_count = excluded.reviews_count,
  is_vip = excluded.is_vip, is_verified = excluded.is_verified,
  languages = excluded.languages, availability = excluded.availability, status = excluded.status;

end $$;
