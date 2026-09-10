"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Target, Trophy } from "lucide-react";
import type { PracticeOverview } from "@/lib/practice-repository";
import { usePracticeOverview } from "./use-practice-overview";
import styles from "./practice-progress.module.css";

export function PracticeProgressStrip() {
  const { data } = usePracticeOverview();
  if (!data || !data.preferences.showProgress) return null;
  const goal = data.week?.goalDays;
  return <aside className={styles.strip} aria-label="Sua meta de prática">
    <Target size={16} aria-hidden="true" />
    <div><strong>{goal ? `Nesta semana: ${data.week!.progressDays} de ${goal} dias com progresso` : "Uma meta no seu ritmo"}</strong>
      <span>{data.mode === "demo" ? "Demonstração: execuções locais não concedem marcos oficiais." : goal ? "Novos marcos confirmados; repetir um envio não conta outro dia." : "Escolha uma meta semanal opcional no perfil."}</span></div>
    <Link href="/perfil#practice-goal">{goal ? "Ajustar meta" : "Definir meta"}</Link>
  </aside>;
}

export function PracticeProfilePanel({ data, refresh }: { data: PracticeOverview; refresh: () => void }) {
  const pending = data.preferences.pending;
  const initial = pending?.preferences ?? data.preferences.preferences;
  const [goalDays, setGoalDays] = useState(initial.goalDays?.toString() ?? "off");
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [showProgress, setShowProgress] = useState(data.preferences.showProgress);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(undefined); setMessage(undefined);
    try {
      const response = await fetch("/api/v1/practice", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ goalDays: goalDays === "off" ? null : Number(goalDays), timeZone, showProgress }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar a meta.");
      setMessage("Preferências salvas. A meta e o fuso da semana em andamento foram preservados.");
      refresh(); window.dispatchEvent(new Event("silogium:practice-updated"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar."); }
    finally { setSaving(false); }
  }
  return <section id="practice-goal" className="profile-panel" aria-labelledby="practice-title">
    <div className="profile-section-heading"><div><h2 id="practice-title">Progresso no seu ritmo</h2><p>Metas e conquistas pessoais, sem XP ou ranking.</p></div><Target size={18} aria-hidden="true" /></div>
    {data.mode === "demo" && <p className={styles.note}>Atividade desta sessão. Seus testes locais aparecem no histórico, mas não geram conclusões ou conquistas oficiais. Os dados em memória podem ser perdidos ao reiniciar.</p>}
    {data.preferences.showProgress && <>
      <dl className="profile-stats"><div><dt>Questões concluídas</dt><dd>{data.summary.distinctProblems}</dd><span>Questões distintas com avaliação oficial completa</span></div>
        <div><dt>Em TypeScript</dt><dd>{data.summary.byRuntime.typescript}</dd><span>Primeira conclusão por questão/linguagem</span></div>
        <div><dt>Em Python</dt><dd>{data.summary.byRuntime.python}</dd><span>Outra linguagem não duplica o total de questões</span></div></dl>
      {data.unverifiedSubmissions > 0 && <p className="profile-caption">{data.unverifiedSubmissions} submissões sem evidência oficial permanecem no histórico, sem serem convertidas em conquistas.</p>}
      {data.week?.goalDays && <div className={styles.goal}><strong>{data.week.progressDays} de {data.week.goalDays} dias com progresso nesta semana</strong>
        <progress max={data.week.goalDays} value={Math.min(data.week.progressDays, data.week.goalDays)} aria-label="Dias com progresso confirmado" />
        <p className="profile-caption">Conta um novo estágio confirmado ou uma primeira conclusão por linguagem. A meta não mede todo o esforço de estudo.</p>
        {data.week.days.length > 0 && <p className="profile-caption">Dias: {data.week.days.map((date) => date.split("-").reverse().join("/")).join(", ")} · {data.week.timeZone}</p>}
        {data.week.countFrom && <p className="profile-caption">Na mudança de fuso, as horas já contadas permanecem na semana anterior.</p>}
      </div>}
      <div className={styles.achievements}><h3><Trophy size={15} aria-hidden="true" /> Conquistas</h3>
        {data.achievements.length ? <ul>{data.achievements.map((achievement) => <li key={achievement.id}><Check size={16} aria-hidden="true" /><div><strong>{achievement.title}</strong><p>{achievement.criterion}</p><time dateTime={achievement.awardedAt}>{new Date(achievement.awardedAt).toLocaleDateString("pt-BR")}</time></div></li>)}</ul>
          : <p className="profile-caption">A primeira conclusão oficial desbloqueia “Primeira solução”. Também há marcos por uma questão progressiva, duas linguagens e cinco questões do catálogo revisado.</p>}
      </div>
      {data.weeks.length > 1 && <details className={styles.weeks}><summary>Semanas registradas</summary><ul>{data.weeks.map((item) => <li key={`${item.weekStart}:${item.timeZone}`}><span>Semana de {item.weekStart.split("-").reverse().join("/")}</span><span>{item.goalDays === null ? "Meta desativada" : `${item.progressDays} de ${item.goalDays} dias`} · {item.timeZone}</span></li>)}</ul></details>}
    </>}
    <form className={styles.form} onSubmit={save}>
      <label>Meta semanal<select aria-label="Meta semanal" value={goalDays} onChange={(event) => setGoalDays(event.target.value)}><option value="off">Sem meta</option>{[1, 2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} {days === 1 ? "dia" : "dias"} com progresso</option>)}</select></label>
      <label>Fuso horário<input aria-label="Fuso horário" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} maxLength={80} list="practice-timezones" spellCheck={false} /><datalist id="practice-timezones">{["America/Sao_Paulo", "America/Manaus", "America/Recife", "America/New_York", "Europe/Lisbon", "UTC"].map((zone) => <option key={zone} value={zone} />)}</datalist></label>
      <label className={styles.check}><input type="checkbox" checked={showProgress} onChange={(event) => setShowProgress(event.target.checked)} /> Mostrar metas e conquistas para mim</label>
      <p className="profile-caption">Opcional. Alterações de meta e fuso valem após a semana atual. Esconder os indicadores não impede resolver questões nem apaga conquistas.</p>
      {pending && <p className={styles.note}>Próxima configuração: {pending.preferences.goalDays === null ? "sem meta" : `${pending.preferences.goalDays} dias`} · {pending.preferences.timeZone}. Vigora após {new Date(pending.effectiveAt).toLocaleDateString("pt-BR")}.</p>}
      <button type="submit" className="button" disabled={saving}>{saving ? "Salvando…" : "Salvar preferências de prática"}</button>
      {message && <p role="status" className="profile-caption">{message}</p>}{error && <p role="alert" className="danger-text">{error}</p>}
    </form>
  </section>;
}
