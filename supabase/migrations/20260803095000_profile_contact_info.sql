-- Contact Information section on the Profile page overhaul needs more than
-- the phone number profiles already carries.
alter table profiles
  add column email text,
  add column address text,
  add column emergency_contact text;

-- Same protection tier as phone/date_of_birth: a staff member can see these
-- (already true — profiles_select_all is open to every authenticated user,
-- unchanged) but editing your own contact info is self-service, unlike
-- phone/DOB/role which stay admin-only identity fields. protect_profile_fields
-- doesn't need updating for that reason — email/address/emergency_contact
-- are deliberately left out of its blocked-fields list, so profiles_update_self
-- already allows a staff member to keep them current themselves.
