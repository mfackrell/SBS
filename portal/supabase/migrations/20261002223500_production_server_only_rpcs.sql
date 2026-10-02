begin;

revoke all on function public.consume_lead_intake_rate_limit(text, timestamptz, integer) from authenticated;
revoke all on function public.consume_portal_rate_limit(text, text, timestamptz, integer) from authenticated;
revoke all on function public.ingest_portal_lead(jsonb, text) from authenticated;
revoke all on function public.handle_new_auth_user() from authenticated;

grant execute on function public.consume_lead_intake_rate_limit(text, timestamptz, integer) to service_role;
grant execute on function public.consume_portal_rate_limit(text, text, timestamptz, integer) to service_role;
grant execute on function public.ingest_portal_lead(jsonb, text) to service_role;

commit;
