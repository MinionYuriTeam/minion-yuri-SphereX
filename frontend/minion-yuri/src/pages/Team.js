// PAGE — Team (opened via #/team)
// Profile pictures live in public/photos/ (no photo = first letter of the name)
import "../styles/Pages.css";

const MEMBERS = [
  { name: "Raman", nick: "Bamba", role: "Team lead · data pipeline", photo: "raman.jpg" },
  { name: "Antonio", nick: "Axe", role: "Backend API and cache", photo: "axe.jpg" },
  { name: "Sam", nick: "Muubi", role: "Frontend · search and blink player", photo: "sam.jpg" },
  { name: "Jay", nick: "Jelly", role: "Frontend · loupe and difference mode", photo: "jelly.jpg" },
  { name: "Shoya", nick: "Trappist", role: "Science features and hosting", photo: "shoya.jpg" },
  { name: "Yash", nick: "Dub", role: "Science lead and pitch", photo: "dub.jpg" },
];

function Team() {
  return (
    <article className="page">
      <a href="#/" className="back">← Back to the tool</a>
      <h2>Made by team Minion Yuri</h2>
      <p>Six students, one weekend, NASA Space Apps 2026.</p>

      <div className="team-grid">
        {MEMBERS.map((m) => (
          <div key={m.name} className="member">
            {m.photo ? (
              <img className="avatar" src={`${process.env.PUBLIC_URL}/photos/${m.photo}`} alt="" />
            ) : (
              <div className="avatar" aria-hidden="true">{m.name[0]}</div>
            )}
            <div>
              <strong>{m.name}</strong> {m.nick && <span className="nick">“{m.nick}”</span>}
              <p className="role">{m.role}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default Team;
