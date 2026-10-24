export default function NoAccess({ email }) {
  return (
    <div className="login">
      <div className="box">
        <div className="lh"><img src="/logo.png" alt="LIVE-IN" /></div>
        <h2>Nemáš prístup</h2>
        <p className="term">Účet <b>{email}</b> nie je v zozname používateľov LIVE-IN alebo bol vypnutý. Ak si člen tímu, napíš Júliusóvi – pridá ťa.</p>
        <form action="/auth/signout" method="post"><button className="btn w" type="submit">Odhlásiť sa</button></form>
      </div>
    </div>
  )
}
