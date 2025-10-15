import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Driver, Session, Team, LapTypeValues } from '../types';
import { calculateDriverStats, calculateTeamStats, formatTime } from './calculations';

interface PDFExportOptions {
  team: Team;
  displayData: Session | Partial<Team>;
  lapTypeValues: LapTypeValues;
  driver?: Driver; // If specified, export only this driver
}

const formatSessionDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const generateLapTimesChartSVG = (driver: Driver): string => {
  if (driver.laps.length === 0) {
    return '<p>No lap data available</p>';
  }

  const lapTimes = driver.laps.map(lap => lap.time);
  const avgTime = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;

  // Calculate range (±7.5s from average)
  const rangeMin = avgTime - 7.5;
  const rangeMax = avgTime + 7.5;

  // SVG dimensions
  const width = 700;
  const height = 300;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate data points
  const points = driver.laps.map((lap, index) => {
    const x = padding.left + (index / (driver.laps.length - 1)) * chartWidth;
    const normalizedValue = (lap.time - rangeMin) / (rangeMax - rangeMin);
    const y = padding.top + chartHeight - (normalizedValue * chartHeight);
    return { x, y, lap };
  });

  // Generate path
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

  // Generate y-axis labels (5 labels)
  const yAxisLabels = Array.from({ length: 5 }, (_, i) => {
    const value = rangeMin + (rangeMax - rangeMin) * (i / 4);
    const y = padding.top + chartHeight - (i / 4) * chartHeight;
    return { value: value.toFixed(1), y };
  });

  // Color mapping
  const getColor = (lapType: string) => {
    switch (lapType) {
      case 'bonus': return '#10b981';
      case 'broken': return '#ef4444';
      case 'changeover': return '#f59e0b';
      case 'safety': return '#3b82f6';
      default: return '#6366f1';
    }
  };

  return `
    <svg width="${width}" height="${height}" style="background: white;">
      <!-- Y-axis -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#d1d5db" stroke-width="2"/>

      <!-- X-axis -->
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#d1d5db" stroke-width="2"/>

      <!-- Y-axis labels -->
      ${yAxisLabels.map(label => `
        <text x="${padding.left - 10}" y="${label.y}" text-anchor="end" dominant-baseline="middle" font-size="12" fill="#6b7280">${label.value}s</text>
        <line x1="${padding.left}" y1="${label.y}" x2="${width - padding.right}" y2="${label.y}" stroke="#e5e7eb" stroke-width="1"/>
      `).join('')}

      <!-- Line -->
      <path d="${pathData}" fill="none" stroke="#6366f1" stroke-width="2"/>

      <!-- Data points -->
      ${points.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="${getColor(p.lap.lapType)}" stroke="white" stroke-width="1"/>
      `).join('')}

      <!-- X-axis labels (lap numbers) -->
      ${points.filter((_, i) => i % Math.max(1, Math.floor(driver.laps.length / 10)) === 0).map(p => `
        <text x="${p.x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="10" fill="#6b7280">${p.lap.number}</text>
      `).join('')}

      <!-- Title -->
      <text x="${width / 2}" y="15" text-anchor="middle" font-size="14" font-weight="bold" fill="#111827">Lap Times (Avg: ${avgTime.toFixed(2)}s)</text>
    </svg>
  `;
};

const generateDeltaChartSVG = (driver: Driver): string => {
  const nonChangeoverLaps = driver.laps.filter(
    lap => lap.lapType !== 'changeover' && lap.lapType !== 'safety'
  );

  if (nonChangeoverLaps.length === 0) {
    return '<p>No delta data available</p>';
  }

  const deltas = nonChangeoverLaps.map(lap => lap.delta);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const maxDelta = Math.max(...deltas, 0);
  const minDelta = Math.min(...deltas, 0);

  // SVG dimensions
  const width = 700;
  const height = 300;
  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const zeroY = padding.top + chartHeight * (maxDelta * 1.1 / ((maxDelta * 1.1) + (Math.abs(minDelta) * 1.1)));

  const barWidth = Math.min(20, chartWidth / nonChangeoverLaps.length - 2);

  const getColor = (lap: any) => {
    if (lap.lapType === 'bonus') return '#10b981';
    if (lap.lapType === 'broken') return '#ef4444';
    if (lap.delta >= 0) return '#f59e0b';
    return '#6366f1';
  };

  return `
    <svg width="${width}" height="${height}" style="background: white;">
      <!-- Y-axis -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#d1d5db" stroke-width="2"/>

      <!-- X-axis -->
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#d1d5db" stroke-width="2"/>

      <!-- Zero line -->
      <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" stroke="#6b7280" stroke-width="2"/>

      <!-- Bars -->
      ${nonChangeoverLaps.map((lap, index) => {
        const x = padding.left + (index / nonChangeoverLaps.length) * chartWidth + (chartWidth / nonChangeoverLaps.length - barWidth) / 2;
        const barHeight = Math.abs(lap.delta) * (chartHeight / ((maxDelta * 1.1) + (Math.abs(minDelta) * 1.1)));
        const y = lap.delta >= 0 ? zeroY - barHeight : zeroY;
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${getColor(lap)}"/>`;
      }).join('')}

      <!-- X-axis labels (lap numbers) -->
      ${nonChangeoverLaps.filter((_, i) => i % Math.max(1, Math.floor(nonChangeoverLaps.length / 15)) === 0).map((lap, index) => {
        const x = padding.left + (nonChangeoverLaps.indexOf(lap) / nonChangeoverLaps.length) * chartWidth + (chartWidth / nonChangeoverLaps.length) / 2;
        return `<text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="10" fill="#6b7280">${lap.number}</text>`;
      }).join('')}

      <!-- Title -->
      <text x="${width / 2}" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#111827">Delta from Target (Avg: ${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(3)}s)</text>
    </svg>
  `;
};

const generateDriverLapsTable = (driver: Driver, lapTypeValues: LapTypeValues): string => {
  if (driver.laps.length === 0) {
    return '<tr><td colspan="4" align="center">No lap data</td></tr>';
  }

  return driver.laps
    .map((lap) => {
      const deltaSign = lap.delta >= 0 ? '+' : '';
      let lapTypeColor = '#000000';
      switch (lap.lapType) {
        case 'bonus': lapTypeColor = '#10b981'; break;  // Green
        case 'broken': lapTypeColor = '#ef4444'; break; // Red
        case 'changeover': lapTypeColor = '#f59e0b'; break; // Orange
        case 'safety': lapTypeColor = '#3b82f6'; break; // Blue
      }

      return `
        <tr>
          <td>${lap.number}</td>
          <td>${formatTime(lap.time)}</td>
          <td>${deltaSign}${lap.delta.toFixed(3)}s</td>
          <td><strong style="color: ${lapTypeColor};">${lap.lapType}</strong> (${lap.lapValue})</td>
        </tr>
      `;
    })
    .join('');
};

const generateDriverSection = (
  driver: Driver,
  lapTypeValues: LapTypeValues,
  sessionDuration: number,
  allDrivers: Driver[]
): string => {
  const stats = calculateDriverStats(driver, lapTypeValues, allDrivers, sessionDuration);

  return `
      <h2>${driver.name}</h2>
      <table width="100%" cellpadding="8" cellspacing="0" border="1">
        <tr>
          <td style="background-color: #f3f4f6;">
            <strong>Achieved Laps:</strong> ${stats.achievedLaps.toFixed(1)}
          </td>
          <td style="background-color: #f3f4f6;">
            <strong>Goal Laps:</strong> ${stats.goalLaps.toFixed(1)}
          </td>
          <td style="background-color: #f3f4f6;">
            <strong>Net Score:</strong> ${stats.netScore > 0 ? '+' : ''}${stats.netScore}
          </td>
        </tr>
        <tr>
          <td style="background-color: #f3f4f6;">
            <strong>Base Laps:</strong> ${stats.baseLaps}
          </td>
          <td style="background-color: #f3f4f6;">
            <strong style="color: #10b981;">Bonus Laps:</strong> <span style="color: #10b981;">${stats.bonusLaps}</span>
          </td>
          <td style="background-color: #f3f4f6;">
            <strong style="color: #ef4444;">Broken Laps:</strong> <span style="color: #ef4444;">${stats.brokenLaps}</span>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f3f4f6;">
            <strong style="color: #f59e0b;">Changeover:</strong> <span style="color: #f59e0b;">${stats.changeoverLaps}</span>
          </td>
          <td style="background-color: #f3f4f6;">
            <strong style="color: #3b82f6;">Safety Car:</strong> <span style="color: #3b82f6;">${stats.safetyLaps}</span>
          </td>
          <td style="background-color: #f3f4f6;">
            <strong>Avg Delta:</strong> ${stats.averageDelta >= 0 ? '+' : ''}${stats.averageDelta.toFixed(3)}s
          </td>
        </tr>
        <tr>
          <td style="background-color: #f3f4f6;">
            <strong>3-Lap Avg:</strong> ${stats.threelapAvg !== null ? `${stats.threelapAvg >= 0 ? '+' : ''}${stats.threelapAvg.toFixed(3)}s` : 'N/A'}
          </td>
          <td style="background-color: #f3f4f6;">
            <strong>Avg Lap Time:</strong> ${formatTime(stats.averageLapTime)}
          </td>
          <td style="background-color: #f3f4f6;">
            <strong>Penalty Laps:</strong> ${driver.penaltyLaps}
          </td>
        </tr>
      </table>

      <h3>Performance Charts</h3>
      <div align="center">
        ${generateLapTimesChartSVG(driver)}
        <br/><br/>
        ${generateDeltaChartSVG(driver)}
      </div>

      <h3>Lap History</h3>
      <table width="100%" cellpadding="6" cellspacing="0" border="1">
        <tr>
          <th><strong>Lap #</strong></th>
          <th><strong>Time</strong></th>
          <th><strong>Delta</strong></th>
          <th><strong>Type (Value)</strong></th>
        </tr>
        ${generateDriverLapsTable(driver, lapTypeValues)}
      </table>
      <br/>
  `;
};

export const generatePDF = async ({ team, displayData, lapTypeValues, driver }: PDFExportOptions) => {
  const teamStats = calculateTeamStats({ ...team, ...displayData } as Team, lapTypeValues);
  const allDrivers = displayData.drivers || team.drivers || [];
  const drivers = driver ? [driver] : allDrivers;
  const sessionDuration = displayData.sessionDuration || team.sessionDuration;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body>
        <h1 align="center">${team.name}</h1>
        <p align="center">
          <strong>${displayData.raceName || 'Race'} - Session ${displayData.sessionNumber || 'N/A'}</strong><br/>
          Duration: ${sessionDuration} minutes<br/>
          Generated: ${new Date().toLocaleString()}
        </p>
        <hr/>

        ${driver ? '' : `
        <h2>Team Statistics</h2>
        <table width="100%" cellpadding="10" cellspacing="0" border="1">
          <tr>
            <td align="center">
              <strong>Goal Laps</strong><br/>
              ${teamStats.goalLaps.toFixed(2)}
            </td>
            <td align="center">
              <strong>Achieved Laps</strong><br/>
              ${teamStats.achievedLaps.toFixed(2)}
            </td>
            <td align="center">
              <strong>Percentage Factor</strong><br/>
              ${teamStats.percentageFactor.toFixed(2)}%
            </td>
          </tr>
        </table>
        <br/>
        `}

        ${drivers.map(d => generateDriverSection(d, lapTypeValues, sessionDuration, allDrivers)).join('')}

        <hr/>
        <p align="center"><small>${team.name} Regularity Race Timer</small></p>
      </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      const driverName = driver ? `${driver.name.replace(/\s+/g, '-')}` : 'All-Drivers';
      const raceName = displayData.raceName ? displayData.raceName.replace(/\s+/g, '-') : 'Race';
      const sessionNumber = displayData.sessionNumber || 'Session';
      const date = new Date().toISOString().split('T')[0];

      const filename = `${driverName}-${raceName}-${sessionNumber}-${date}.pdf`;

      // Copy the PDF to a properly named file
      const newUri = `${FileSystem.cacheDirectory}${filename}`;
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
