# Security and privacy

Workspace data is stored in your Convex deployment and scoped to the signed-in account. Every query and mutation derives document ownership from server-verified identity. Never accept owner IDs from clients or weaken access checks to bypass setup errors. Development sign-in has no email verification or recovery yet, so use development accounts with unique passwords.

An older browser-local version of the app stored data in the browser without an account boundary. Its code was removed on 2 October 2026, but data it saved stays in that browser profile until you clear it. Keep any old exports private.

A public security-reporting channel has not been configured. Before public release, enable private vulnerability reporting on the chosen repository and document that channel here. Do not post credentials or other users' records in public issues.

A downloaded backup (Settings → Download backup) contains your whole private workspace in plain JSON. Store it like any personal document, and don't attach it to public issues. Deleting your account removes the workspace data and the sign-in account; a backup you downloaded earlier is not affected.
