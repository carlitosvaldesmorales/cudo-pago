# Access Capability Matrix v1

| Capability | Public / REPORTER | CLUB_ADMIN | MEDIA_PARTNER | PLATFORM_OPERATOR | SUPER_ADMIN |
|---|---:|---:|---:|---:|---:|
| View public championship | yes | yes | yes | yes | yes |
| Contribute result observation | yes | yes | yes | yes | yes |
| Manage own club results | no | yes, club scope | no | yes | yes |
| Publish match event | no | no | yes, granted scope | no | yes |
| Review observations | no | yes, participating club scope | no | yes | yes |
| Govern all results | no | no | no | yes | yes |
| Manage clubs | no | no | no | yes | yes |
| Manage access / dirigentes | no | no | no | yes | yes |
| Manage content | no | no | no | yes | yes |
| View operational audit | no | no | no | yes | yes |
| Change platform policy | no | no | no | no | yes |
| Grant SUPER_ADMIN | no | no | no | no | yes |

The invariant is Separation of Duties: PLATFORM_OPERATOR can run the competition but cannot change the rules that bound its own authority.