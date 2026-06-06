package app.fintrack.ai;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class FinTrackMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "fintrack_alerts";
    private static final String CHANNEL_NAME = "FinTrack Alerts";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences("fintrack_widget", MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        String title = remoteMessage.getNotification() != null
            ? remoteMessage.getNotification().getTitle()
            : remoteMessage.getData().get("title");
        String body = remoteMessage.getNotification() != null
            ? remoteMessage.getNotification().getBody()
            : remoteMessage.getData().get("body");

        if (title == null) title = "FinTrack";
        if (body == null) body = "";

        createNotificationChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String deepLink = remoteMessage.getData().get("deepLink");
        if (deepLink != null) intent.putExtra("deepLink", deepLink);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent);

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify((int) System.currentTimeMillis(), builder.build());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Budget alerts, bill reminders, and financial updates");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
