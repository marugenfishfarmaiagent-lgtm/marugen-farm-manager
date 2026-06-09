import { useState } from 'react'
import { DatabaseBackup, Download } from 'lucide-react'
import { Card, Btn } from './ui'
import * as db from '../lib/database'
import { exportFullBackup } from '../lib/backupExport'

export default function BackupExportPanel({
  currentUser,
  cloudMode,
  getBackupData,
  addNotification,
}) {
  const [exporting, setExporting] = useState(false)

  if (currentUser?.role !== 'owner') return null

  const runExport = async (refreshFromCloud) => {
    setExporting(true)
    try {
      const counts = await exportFullBackup({
        state: getBackupData(),
        exportedBy: currentUser.name,
        refreshFromCloud,
        fetchCloudData: cloudMode ? () => db.fetchAllData() : null,
      })
      addNotification({
        type: 'success',
        title: 'Backup downloaded',
        message: `JSON + CSV saved: ${counts.invoices} invoices, ${counts.expenses} expenses, ${counts.products} products.`,
      })
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Backup failed',
        message: err?.message || 'Could not create backup files.',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card className="p-4 border-cyan-500/20 bg-cyan-500/5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <DatabaseBackup size={16} className="text-cyan-400" />
            Data backup export
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Download a full JSON archive plus separate invoice and expense CSV files for accounting.
            PINs are never included. Receipt images stay in the JSON backup when stored on this device.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Btn
            variant="secondary"
            size="sm"
            onClick={() => runExport(false)}
            disabled={exporting}
            className="justify-center"
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export now'}
          </Btn>
          {cloudMode && (
            <Btn
              variant="primary"
              size="sm"
              onClick={() => runExport(true)}
              disabled={exporting}
              className="justify-center"
            >
              <DatabaseBackup size={14} />
              {exporting ? 'Exporting…' : 'Refresh cloud & export'}
            </Btn>
          )}
        </div>
      </div>
    </Card>
  )
}
