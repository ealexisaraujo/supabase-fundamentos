/**
 * Process Like Events Edge Function
 *
 * This function processes messages from the `like_events` queue and:
 * 1. Logs analytics data for like/unlike events
 * 2. Can be extended to update aggregated statistics
 * 3. Handles dead-letter queue for failed messages
 *
 * Invoked via:
 * - HTTP POST (manual or pg_cron scheduled)
 * - Supabase Dashboard invoke
 *
 * @see docs/QUEUES_BACKGROUND_TASKS_ARCHITECTURE.md
 */

// @ts-ignore - Deno imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Types for queue messages
interface LikeEventMessage {
  event_type: "like" | "unlike";
  event_value: 1 | -1;
  post_id: string;
  post_owner_id: string | null;
  post_caption: string | null;
  liker_session_id: string;
  liker_profile_id: string | null;
  new_like_count: number;
  timestamp: string;
  metadata: {
    action: "add_rating" | "remove_rating";
    rating_id?: string;
  };
}

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: LikeEventMessage;
}

interface ProcessingResult {
  processed: number;
  failed: number;
  events: {
    msg_id: number;
    event_type: string;
    post_id: string;
    status: "success" | "failed";
    error?: string;
  }[];
}

// @ts-ignore - Deno global
Deno.serve(async (_req: Request) => {
  try {
    // Create Supabase client with service role for queue operations
    // @ts-ignore - Deno global
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // @ts-ignore - Deno global
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Read messages from the like_events queue
    // vt = visibility timeout (30 seconds), qty = number of messages to read
    const { data: messages, error: readError } = await supabase.rpc(
      "pgmq_read",
      {
        queue_name: "like_events",
        vt: 30,
        qty: 10,
      }
    );

    if (readError) {
      console.error("[process-like-events] Error reading queue:", readError);
      throw readError;
    }

    // Type assertion for messages
    const queueMessages = messages as QueueMessage[] | null;

    if (!queueMessages || queueMessages.length === 0) {
      console.log("[process-like-events] No messages to process");
      return new Response(
        JSON.stringify({
          processed: 0,
          failed: 0,
          events: [],
          message: "No messages in queue",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[process-like-events] Processing ${queueMessages.length} messages`
    );

    const result: ProcessingResult = {
      processed: 0,
      failed: 0,
      events: [],
    };

    const successfulMsgIds: number[] = [];

    for (const msg of queueMessages) {
      try {
        const event = msg.message;

        // Log the event for analytics
        console.log(
          `[process-like-events] Event: ${event.event_type} | Post: ${event.post_id} | Count: ${event.new_like_count}`
        );

        // Here you could:
        // 1. Insert into analytics_events table
        // 2. Update aggregated daily statistics
        // 3. Trigger additional workflows

        // For now, we'll just log and archive
        // Future: Insert into analytics table
        // await supabase.from('analytics_events').insert({
        //   event_type: event.event_type,
        //   post_id: event.post_id,
        //   session_id: event.liker_session_id,
        //   profile_id: event.liker_profile_id,
        //   metadata: event,
        //   created_at: event.timestamp
        // });

        result.events.push({
          msg_id: msg.msg_id,
          event_type: event.event_type,
          post_id: event.post_id,
          status: "success",
        });

        successfulMsgIds.push(msg.msg_id);
        result.processed++;
      } catch (processError) {
        console.error(
          `[process-like-events] Error processing msg ${msg.msg_id}:`,
          processError
        );

        result.events.push({
          msg_id: msg.msg_id,
          event_type: msg.message?.event_type || "unknown",
          post_id: msg.message?.post_id || "unknown",
          status: "failed",
          error:
            processError instanceof Error
              ? processError.message
              : "Unknown error",
        });

        result.failed++;

        // If message has been retried too many times, move to DLQ
        if (msg.read_ct >= 3) {
          console.log(
            `[process-like-events] Moving msg ${msg.msg_id} to DLQ after ${msg.read_ct} retries`
          );
          // Future: Move to dead letter queue
          // await supabase.rpc('pgmq_send', {
          //   queue_name: 'like_events_dlq',
          //   message: msg.message
          // });
          successfulMsgIds.push(msg.msg_id); // Remove from main queue
        }
      }
    }

    // Archive successfully processed messages
    if (successfulMsgIds.length > 0) {
      for (const msgId of successfulMsgIds) {
        const { error: archiveError } = await supabase.rpc("pgmq_archive", {
          queue_name: "like_events",
          msg_id: msgId,
        });

        if (archiveError) {
          console.error(
            `[process-like-events] Error archiving msg ${msgId}:`,
            archiveError
          );
        }
      }
    }

    console.log(
      `[process-like-events] Completed: ${result.processed} processed, ${result.failed} failed`
    );

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-like-events] Fatal error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        processed: 0,
        failed: 0,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
