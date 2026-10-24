; Scrawl's own steps in the Windows setup (tauri.conf.json, bundle.windows.nsis.installerHooks).

; Opening at login goes with the app (design/background.md 5): its line in the user's Run key,
; and Task Manager's switch for it. An update does not run the uninstaller, so this is only when
; Scrawl is taken off the computer.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Scrawl"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Scrawl"
!macroend
