@echo off
set JAVA_HOME=C:\Users\FairRide\AppData\Local\Temp\jdk21\jdk-21.0.11+10
set ANDROID_HOME=C:\Users\FairRide\AppData\Local\Temp\android-sdk
call gradlew.bat assembleDebug --no-daemon --console=plain
pause