using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    public class Notification
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("user_id")]
        public int UserId { get; set; }

        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("related_entity_type")]
        public string RelatedEntityType { get; set; }

        [JsonProperty("related_entity_id")]
        public int? RelatedEntityId { get; set; }

        [JsonProperty("is_read")]
        public bool IsRead { get; set; }

        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }
    }
}
