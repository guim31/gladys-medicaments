# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration talks to no service other than Gladys: no network access is
needed beyond the Gladys host API. It stores the treatments, and nothing else,
in `/data/medications.json` (with `medications.json.bak`, the previous version,
and `medications.json.corrupt` when an unreadable file was kept aside). These
files hold **health data** (treatment names, persons, intake times and the
intakes of the last 8 days) but no secret; they are readable by whoever can
read the integration volume on the Gladys host. The logs never contain the
names of the treatments nor of the persons.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to.
