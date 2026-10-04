import csv
import matplotlib.pyplot as plt
from matplotlib.offsetbox import AnnotationBbox, TextArea, VPacker

# Member Class
class Member: 
    def __init__(self, name):
        self.name = name

# Team Class
class Team:
    def __init__(self, name):
        self.name = name
        self.members = []
    
    # Add member method
    def add_member(self, name):
        self.members.append(Member(name))

# Platform Class
class Platform:
    def __init__(self, name, owner=None):
        self.name = name
        self.owner = owner
        self.teams = {}
    # Add Team method
    def add_team(self, team_name):
        if team_name not in self.teams:
            self.teams[team_name] = Team(team_name)
        return self.teams[team_name]
    

# Load from CSV method
def load_from_csv(file_name):
    platforms = {}

    with open(file_name, 'r') as file:
        reader = csv.DictReader(file)

        for row in reader:
            p_name = row['Platform']
            t_name = row['Team']
            first = row['MemberFirst']
            last = row['MemberLast']
            full_name = f"{first} {last}"
            owner = row['Owner']

            # Create platform if not exists
            if p_name not in platforms:
                platforms[p_name] = Platform(p_name, owner)

            # Add team
            team = platforms[p_name].add_team(t_name)

            # Add member
            team.add_member(full_name)

    return platforms



def plot_hierarchy(platforms):
    # Scale figure size dynamically
    num_platforms = len(platforms)
    max_teams = max(len(p.teams) for p in platforms.values()) if platforms else 1

    width = max(12, max_teams * 3)   # wider if more teams
    height = max(8, num_platforms * 4)  # taller if more platforms

    fig, ax = plt.subplots(figsize=(width, height))
    y = 0.95  # Start position near top

    for platform in platforms.values():

        # PLATFORM NODE (name + owner)
        platform_label = f"{platform.name}\n(Owner: {platform.owner})"
        ax.text(
            0.5, y, platform_label,
            ha='center', fontsize=14, fontweight='bold', linespacing=1.2,
            bbox=dict(facecolor='skyblue', boxstyle='round,pad=0.5')
        )

        # Drop line from platform downwards
        drop_y = y - 0.05
        ax.plot([0.5, 0.5], [y - 0.02, drop_y], color='black')

        # Auto-place teams horizontally
        teams = list(platform.teams.values())
        num_teams = len(teams)
        if num_teams > 0:
            x_positions = [(i + 1) / (num_teams + 1) for i in range(num_teams)]
            ax.plot([x_positions[0], x_positions[-1]], [drop_y, drop_y], color='black')

            # TEAM NODES
            y_team = drop_y - 0.12

            for x, team in zip(x_positions, teams):
                ax.plot([x, x], [drop_y, y_team], color='black')

                team_name = team.name
                # Members on new lines
                members_text = "\n".join([m.name for m in team.members])

                # Two text areas: bold team name, normal members
                team_title = TextArea(team_name, textprops=dict(fontsize=12, fontweight='bold', ha='center'))
                team_members = TextArea(members_text, textprops=dict(fontsize=11, ha='center'))

                # Stack them vertically
                box = VPacker(children=[team_title, team_members], align="center", pad=0.4, sep=4)

                # Single rounded box around both lines
                ab = AnnotationBbox(
                    box, (x, y_team),
                    frameon=True,
                    bboxprops=dict(boxstyle='round,pad=0.6', fc="#dcb776", ec='black'),
                    box_alignment=(0.5, 0.5)
                )
                ax.add_artist(ab)

            # Move down to next platform
            y = y_team - 0.20
        else:
            y = drop_y - 0.20

    ax.axis('off')
    plt.tight_layout()
    plt.savefig('platform_diagram.png', dpi=300, bbox_inches='tight')
    plt.show()

test = load_from_csv('/Users/prachikarkhanis/Downloads/large_platform_dataset_7_platforms.csv')
plot_hierarchy(test)