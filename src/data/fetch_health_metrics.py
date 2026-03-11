import json
import os
import urllib.request
import time
from datetime import datetime

def fetch_package_health(package_name):
    """Fetches health, platform, and maintenance metrics from pub.dev."""
    health_data = {
        "lastUpdated": None,
        "pubPoints": None,
        "verifiedPublisher": False,
        "platforms": []
    }
    
    headers = {'User-Agent': 'SaropaHealthBot/1.0'}
    
    try:
        # 1. Fetch general package details (for Date)
        pkg_url = f"https://pub.dev/api/packages/{package_name}"
        pkg_req = urllib.request.Request(pkg_url, headers=headers)
        
        with urllib.request.urlopen(pkg_req) as response:
            if response.status == 200:
                pkg_json = json.loads(response.read().decode('utf-8'))
                
                published_str = pkg_json.get('latest', {}).get('published')
                if published_str:
                    try:
                        dt = datetime.fromisoformat(published_str.replace('Z', '+00:00'))
                        health_data["lastUpdated"] = dt.strftime('%Y-%m-%d')
                    except Exception:
                        health_data["lastUpdated"] = published_str.split('T')[0]

        # 2. Fetch the automated metrics (for Points and Platforms)
        metrics_url = f"https://pub.dev/api/packages/{package_name}/metrics"
        metrics_req = urllib.request.Request(metrics_url, headers=headers)
        
        with urllib.request.urlopen(metrics_req) as response:
            if response.status == 200:
                metrics_json = json.loads(response.read().decode('utf-8'))
                
                health_data["pubPoints"] = metrics_json.get('score', {}).get('grantedPoints')
                
                tags = metrics_json.get('score', {}).get('tags', [])
                platforms = [tag.split(':')[1] for tag in tags if tag.startswith('platform:')]
                health_data["platforms"] = sorted(platforms)

        # 3. Fetch the Publisher data directly from its dedicated endpoint
        pub_url = f"https://pub.dev/api/packages/{package_name}/publisher"
        pub_req = urllib.request.Request(pub_url, headers=headers)
        
        with urllib.request.urlopen(pub_req) as response:
            if response.status == 200:
                pub_json = json.loads(response.read().decode('utf-8'))
                # The API returns the publisherId, or null if the package is unverified/not under a publisher
                if pub_json.get('publisherId'):
                    health_data["verifiedPublisher"] = True

    except urllib.error.HTTPError:
        # Silently pass if the package isn't found
        pass
    except Exception as e:
        pass

    return health_data


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, 'known_issues.json')
    output_file = os.path.join(script_dir, 'known_issues_updated.json')

    if not os.path.exists(input_file):
        print(f"Error: Could not find {input_file}")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    issues = data.get('issues', [])
    print(f"Fetching health metrics from pub.dev for {len(issues)} packages...\n")

    for issue in issues:
        raw_name = issue.get('name')
        if not raw_name:
            continue
        
        clean_name = raw_name.split(' (')[0].split('_v')[0].strip().lower()
        
        print(f"Checking {clean_name}...", end=" ", flush=True)
        
        metrics = fetch_package_health(clean_name)
        
        issue['lastUpdated'] = metrics['lastUpdated']
        issue['pubPoints'] = metrics['pubPoints']
        issue['verifiedPublisher'] = metrics['verifiedPublisher']
        issue['platforms'] = metrics['platforms']
        
        points_str = f"{metrics['pubPoints']}/140" if metrics['pubPoints'] is not None else "N/A"
        date_str = metrics['lastUpdated'] or "Unknown"
        pub_str = "Verified" if metrics['verifiedPublisher'] else "Unverified"
        print(f"[{points_str}] [{pub_str}] [Updated: {date_str}]")
        
        # Sleep slightly longer (500ms) since we are now hitting 3 endpoints per package
        time.sleep(0.5)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Done! Health metrics written to {output_file}")

if __name__ == "__main__":
    main()