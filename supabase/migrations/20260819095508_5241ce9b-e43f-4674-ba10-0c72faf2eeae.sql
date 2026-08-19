insert into public.billing_contacts (org_kind, org_id, email, role, is_primary)
select 'agency', a.id, v.email, 'Billing contact', v.email = 'twmaina@ipsl.co.ke'
from public.agencies a,
     (values ('twmaina@ipsl.co.ke'),('cnderitu@ipsl.co.ke'),('dmuriuki@ipsl.co.ke')) as v(email)
where a.slug = 'pesalink'
on conflict do nothing;