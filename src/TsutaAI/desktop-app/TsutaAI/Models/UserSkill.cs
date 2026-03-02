using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    public class UserSkill
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("skillName")]
        public string SkillName { get; set; } = string.Empty;

        [JsonProperty("skillLevel")]
        public int SkillLevel { get; set; }

        /// <summary>
        /// スキルレベルをパーセンテージ（0-100）で取得します
        /// </summary>
        public double LevelPercentage => SkillLevel * 10.0;
    }
}
