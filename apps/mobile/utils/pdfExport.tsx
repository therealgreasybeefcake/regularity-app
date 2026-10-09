import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Driver, Session, Team, LapTypeValues } from '../types';
import { calculateDriverStats, calculateTeamStats, formatTime } from './calculations';
import { calculateConsistency, analyzePaceTrend, segmentStints } from '@regularity/core';

interface PDFExportOptions {
  team: Team;
  displayData: Session | Partial<Team>;
  lapTypeValues: LapTypeValues;
  driver?: Driver; // If specified, export only this driver
}

// A4 in PostScript points (72/in). Margins are applied by the native printer on
// iOS (it ignores CSS @page) and by CSS @page on Android and the web.
const PAGE = { width: 595, height: 842 };
const IOS_MARGINS = { top: 40, bottom: 40, left: 36, right: 36 };

const LAP_TYPE_COLORS: Record<string, string> = {
  bonus: '#059669',
  broken: '#dc2626',
  changeover: '#d97706',
  safety: '#2563eb',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const signed = (n: number, digits = 3) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}s`;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STYLES = `
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page + .page { break-before: page; page-break-before: always; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #111827; padding-bottom: 6px; margin-bottom: 14px; }
  .doc-header h1 { font-size: 18pt; margin: 0; }
  .doc-header .meta { text-align: right; font-size: 9pt; color: #4b5563; line-height: 1.4; }
  h2 { font-size: 15pt; margin: 0 0 10px; }
  h3 { font-size: 11.5pt; margin: 16px 0 6px; break-after: avoid; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #d1d5db; padding: 4px 7px; text-align: left; }
  th { background: #f3f4f6; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.03em; color: #374151; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .stat { background: #f3f4f6; border-radius: 4px; padding: 6px 8px; }
  .stat .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
  .stat .value { font-size: 12pt; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .stat.lg .value { font-size: 18pt; }
  .footer { margin-top: 18px; font-size: 8pt; color: #9ca3af; text-align: center; }
`;

const stat = (label: string, value: string, color?: string, lg = false) => `
  <div class="stat${lg ? ' lg' : ''}">
    <div class="label">${label}</div>
    <div class="value"${color ? ` style="color: ${color};"` : ''}>${value}</div>
  </div>`;

const generateDriverLapsTable = (driver: Driver): string => {
  const rows = driver.laps.length === 0
    ? '<tr><td colspan="5" style="text-align: center;">No lap data</td></tr>'
    : driver.laps
        .map((lap) => {
          const color = LAP_TYPE_COLORS[lap.lapType] ?? '#111827';
          return `
            <tr>
              <td class="num">${lap.number}</td>
              <td class="num">${formatTime(lap.time)}</td>
              <td class="num">${signed(lap.delta)}</td>
              <td style="color: ${color}; font-weight: 600;">${titleCase(lap.lapType)}</td>
              <td class="num">${lap.lapValue}</td>
            </tr>`;
        })
        .join('');
  return `
    <h3>Lap History</h3>
    <table>
      <thead>
        <tr><th class="num">Lap</th><th class="num">Time</th><th class="num">Delta</th><th>Type</th><th class="num">Value</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const generateStintTable = (driver: Driver): string => {
  const stints = segmentStints(driver);
  if (stints.length === 0) return '';
  const lapRef = (lap: { number: number; delta: number } | null) =>
    lap ? `Lap ${lap.number} (${signed(lap.delta)})` : 'N/A';
  const rows = stints
    .map((stint) => `
      <tr>
        <td class="num">${stint.index + 1}</td>
        <td class="num">${stint.count}</td>
        <td class="num">${signed(stint.avgDelta)}</td>
        <td style="color: ${LAP_TYPE_COLORS.bonus};">${lapRef(stint.best)}</td>
        <td style="color: ${LAP_TYPE_COLORS.broken};">${lapRef(stint.worst)}</td>
      </tr>`)
    .join('');
  return `
    <h3>Stints</h3>
    <table>
      <thead>
        <tr><th class="num">Stint</th><th class="num">Laps</th><th class="num">Avg Delta</th><th>Best</th><th>Worst</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const generateDriverPage = (
  header: string,
  driver: Driver,
  lapTypeValues: LapTypeValues,
  sessionDuration: number,
  allDrivers: Driver[]
): string => {
  const stats = calculateDriverStats(driver, lapTypeValues, allDrivers, sessionDuration);
  const consistency = calculateConsistency(driver.laps);
  const pace = analyzePaceTrend(driver.laps);

  return `
    <section class="page">
      ${header}
      <h2>${escapeHtml(driver.name)}</h2>
      <div class="stat-grid">
        ${stat('Achieved Laps', stats.achievedLaps.toFixed(1))}
        ${stat('Goal Laps', stats.goalLaps.toFixed(1))}
        ${stat('Net Score', `${stats.netScore > 0 ? '+' : ''}${stats.netScore}`)}
        ${stat('Base Laps', String(stats.baseLaps))}
        ${stat('Bonus Laps', String(stats.bonusLaps), LAP_TYPE_COLORS.bonus)}
        ${stat('Broken Laps', String(stats.brokenLaps), LAP_TYPE_COLORS.broken)}
        ${stat('Changeover', String(stats.changeoverLaps), LAP_TYPE_COLORS.changeover)}
        ${stat('Safety Car', String(stats.safetyLaps), LAP_TYPE_COLORS.safety)}
        ${stat('Avg Delta', signed(stats.averageDelta))}
        ${stat('3-Lap Avg', stats.threelapAvg !== null ? signed(stats.threelapAvg) : 'N/A')}
        ${stat('Avg Lap Time', formatTime(stats.averageLapTime))}
        ${stat('Penalty Laps', String(driver.penaltyLaps))}
        ${stat('Consistency', `&plusmn;${consistency.deltaStdDev.toFixed(3)}s`)}
        ${stat('Pace Trend', titleCase(pace.direction))}
        ${stat('Projected Next', pace.projectedNext !== null ? formatTime(pace.projectedNext) : 'N/A')}
      </div>
      ${generateStintTable(driver)}
      ${generateDriverLapsTable(driver)}
    </section>`;
};

const generateSummaryPage = (
  header: string,
  drivers: Driver[],
  lapTypeValues: LapTypeValues,
  sessionDuration: number,
  teamStats: { goalLaps: number; achievedLaps: number; percentageFactor: number }
): string => {
  const rows = drivers
    .map((d) => {
      const s = calculateDriverStats(d, lapTypeValues, drivers, sessionDuration);
      return `
        <tr>
          <td>${escapeHtml(d.name)}</td>
          <td class="num">${d.laps.length}</td>
          <td class="num">${s.achievedLaps.toFixed(1)}</td>
          <td class="num">${s.goalLaps.toFixed(1)}</td>
          <td class="num">${s.netScore > 0 ? '+' : ''}${s.netScore}</td>
          <td class="num">${signed(s.averageDelta)}</td>
          <td class="num">${d.penaltyLaps}</td>
        </tr>`;
    })
    .join('');
  return `
    <section class="page">
      ${header}
      <h2>Team Summary</h2>
      <div class="stat-grid">
        ${stat('Goal Laps', teamStats.goalLaps.toFixed(2), undefined, true)}
        ${stat('Achieved Laps', teamStats.achievedLaps.toFixed(2), undefined, true)}
        ${stat('Percentage Factor', `${teamStats.percentageFactor.toFixed(2)}%`, undefined, true)}
      </div>
      <h3>Drivers</h3>
      <table>
        <thead>
          <tr><th>Driver</th><th class="num">Laps</th><th class="num">Achieved</th><th class="num">Goal</th><th class="num">Net</th><th class="num">Avg Delta</th><th class="num">Penalty</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
};

/** Print an HTML document from a hidden iframe (web: the browser's "Save as PDF"). */
const printHtmlOnWeb = (html: string) =>
  new Promise<void>((resolve, reject) => {
    const doc = (globalThis as any).document;
    if (!doc) return reject(new Error('No document available'));
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return reject(new Error('Print frame unavailable'));
      // Remove the frame once the print dialog closes (afterprint fires then).
      win.addEventListener('afterprint', () => setTimeout(() => iframe.remove(), 0));
      win.focus();
      win.print();
      resolve();
    };
    iframe.srcdoc = html;
    doc.body.appendChild(iframe);
  });

export const generatePDF = async ({ team, displayData, lapTypeValues, driver }: PDFExportOptions) => {
  const teamStats = calculateTeamStats({ ...team, ...displayData } as Team, lapTypeValues);
  const allDrivers = displayData.drivers || team.drivers || [];
  const drivers = driver ? [driver] : allDrivers;
  const sessionDuration = displayData.sessionDuration || team.sessionDuration;

  const driverSlug = driver ? driver.name.replace(/\s+/g, '-') : 'All-Drivers';
  const raceSlug = displayData.raceName ? displayData.raceName.replace(/\s+/g, '-') : 'Race';
  const sessionSlug = displayData.sessionNumber || 'Session';
  const filename = `${driverSlug}-${raceSlug}-${sessionSlug}-${new Date().toISOString().split('T')[0]}`;

  // Repeated at the top of every page so a printed driver page stands alone.
  const header = `
    <header class="doc-header">
      <h1>${escapeHtml(team.name)}</h1>
      <div class="meta">
        <strong>${escapeHtml(displayData.raceName || 'Race')} &middot; Session ${escapeHtml(String(displayData.sessionNumber || 'N/A'))}</strong><br/>
        Duration ${sessionDuration} min &middot; Generated ${escapeHtml(new Date().toLocaleString())}
      </div>
    </header>`;

  const pages = [
    driver ? '' : generateSummaryPage(header, allDrivers, lapTypeValues, sessionDuration, teamStats),
    ...drivers.map((d) => generateDriverPage(header, d, lapTypeValues, sessionDuration, allDrivers)),
  ].join('');

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(filename)}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    ${pages}
    <p class="footer">${escapeHtml(team.name)} &middot; Regularity Race Timer</p>
  </body>
</html>`;

  try {
    // expo-print's web printToFileAsync just prints the current screen, so print
    // the report itself from an iframe instead.
    if (Platform.OS === 'web') {
      await printHtmlOnWeb(html);
      return;
    }

    const { uri } = await Print.printToFileAsync({
      html,
      width: PAGE.width,
      height: PAGE.height,
      ...(Platform.OS === 'ios' ? { margins: IOS_MARGINS } : {}),
    });

    if (await Sharing.isAvailableAsync()) {
      // Copy the PDF to a properly named file
      const newUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
      await FileSystem.copyAsync({
        from: uri,
        to: newUri,
      });

      await Sharing.shareAsync(newUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
