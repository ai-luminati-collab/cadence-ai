import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect the root path directly to the dashboard router
  // The middleware will automatically catch this and route the user to /login if they aren't authenticated!
  redirect('/dashboard')
}
