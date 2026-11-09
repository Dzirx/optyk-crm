; Microsoft Visual C++ Runtime jest wymagany przez PostgreSQL.
; Instalator uruchamia go po cichu (gdy jest już zainstalowany, kończy się od razu).
!macro customInstall
  ExecWait '"$INSTDIR\resources\vcredist\vc_redist.x64.exe" /install /quiet /norestart' $0
!macroend
