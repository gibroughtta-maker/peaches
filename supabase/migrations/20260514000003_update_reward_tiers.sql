alter table public.vouchers
  add column if not exists retail_value numeric(8,2),
  add column if not exists valid_months integer not null default 6;

with reward_tiers(name, description, emoji, points_cost, retail_value, valid_months) as (
  values
    ('Free Eyebrow Wax or Upper Lip Wax', 'Treatment reward for 100 points', '✨', 100, 10.50, 6),
    ('Free Lash Tint or Brow Wax', 'Treatment reward for 200 points', '💅', 200, 13.00, 6),
    ('Free Underarm Wax or Brow Wax & Tint', 'Treatment reward for 350 points', '🌸', 350, 21.00, 6),
    ('Free Half Leg or Full Arms Wax', 'Treatment reward for 500 points', '💗', 500, 26.00, 6),
    ('Free Lash Lift or Brow Lamination', 'Treatment reward for 800 points', '⭐', 800, 40.00, 6),
    ('Free Brazilian or Hollywood Wax', 'Treatment reward for 1,200 points', '🍑', 1200, 48.00, 6),
    ('Free Hollywood + Half Leg Package', 'Treatment reward for 2,000 points', '👑', 2000, 74.00, 6)
)
insert into public.vouchers (name, description, emoji, points_cost, retail_value, valid_months, is_active)
select name, description, emoji, points_cost, retail_value, valid_months, true
from reward_tiers tier
where not exists (
  select 1
  from public.vouchers voucher
  where voucher.name = tier.name
);

with reward_tiers(name, description, emoji, points_cost, retail_value, valid_months) as (
  values
    ('Free Eyebrow Wax or Upper Lip Wax', 'Treatment reward for 100 points', '✨', 100, 10.50, 6),
    ('Free Lash Tint or Brow Wax', 'Treatment reward for 200 points', '💅', 200, 13.00, 6),
    ('Free Underarm Wax or Brow Wax & Tint', 'Treatment reward for 350 points', '🌸', 350, 21.00, 6),
    ('Free Half Leg or Full Arms Wax', 'Treatment reward for 500 points', '💗', 500, 26.00, 6),
    ('Free Lash Lift or Brow Lamination', 'Treatment reward for 800 points', '⭐', 800, 40.00, 6),
    ('Free Brazilian or Hollywood Wax', 'Treatment reward for 1,200 points', '🍑', 1200, 48.00, 6),
    ('Free Hollywood + Half Leg Package', 'Treatment reward for 2,000 points', '👑', 2000, 74.00, 6)
)
update public.vouchers voucher
set
  description = tier.description,
  emoji = tier.emoji,
  points_cost = tier.points_cost,
  retail_value = tier.retail_value,
  valid_months = tier.valid_months,
  is_active = true
from reward_tiers tier
where voucher.name = tier.name;

update public.vouchers
set is_active = false
where name not in (
  'Free Eyebrow Wax or Upper Lip Wax',
  'Free Lash Tint or Brow Wax',
  'Free Underarm Wax or Brow Wax & Tint',
  'Free Half Leg or Full Arms Wax',
  'Free Lash Lift or Brow Lamination',
  'Free Brazilian or Hollywood Wax',
  'Free Hollywood + Half Leg Package'
);
