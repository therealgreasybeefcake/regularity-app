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
