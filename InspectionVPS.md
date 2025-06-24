## Revision de Hardware VPS
```bash
echo -e "\n📌 CPU Info:" && lscpu | grep -E 'Model name|Socket|Thread|Core|CPU\(s\)' && \
echo -e "\n📦 RAM Info:" && free -h && \
echo -e "\n🔁 Swap Info:" && swapon --show
```
