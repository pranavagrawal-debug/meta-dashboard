# Meta lead dashboard
Static page in `public/`, one API route in `api/data.js`, shared storage in Upstash Redis.
Environment variables: `APP_PASSWORD` (team password) plus the Upstash Redis variables that Vercel adds when you connect the database.
Daily use: open the site, enter the password, upload the Meta live sheet and the lead dump. Everyone sees the same data, frozen good leads and ad copy.
