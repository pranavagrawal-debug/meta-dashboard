# Meta lead dashboard
Static page in `public/`, one API route in `api/data.js`, shared storage in Postgres (Neon). Lead names and phone numbers are stored with the leads.
Environment variables: `APP_PASSWORD` (team password) plus the Upstash Redis variables that Vercel adds when you connect the database.
Daily use: open the site, enter the password, upload the Meta live sheet and the lead dump. Everyone sees the same data, frozen good leads and ad copy.
